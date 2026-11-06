import pg from "pg";
import { TwelveDataProvider } from "../data/twelvedata";
import { PostgresUsageLedger } from "../data/usage";
import { PostgresPriceRepository } from "../db/prices";
import { runLoggedJob } from "./job-log";

export const HORIZONS = [30, 60, 90, 180] as const;
export interface EtfPickForOutcome { symbol: string; exchange: string | null; name: string; entry_price: string; entry_date: string; benchmark_symbol: string }
export interface CloseBar { date: string; close: number }
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const returnPct = (entry: number, exit: number) => Math.round(((exit / entry) - 1) * 100_000) / 1_000;
export const isUsListed = (exchange: string | null) => /^(?:NASDAQ|NYSE|NYSE ARCA|ARCA|AMEX|NYSE MKT|BATS|CBOE)$/i.test(exchange ?? "");
export function outcomeFor(pick: EtfPickForOutcome, horizon: number, entry: CloseBar, exit: CloseBar, benchmarkEntry: CloseBar | null, benchmarkExit: CloseBar | null) {
  const stockReturn = returnPct(entry.close, exit.close);
  const benchmarkReturn = benchmarkEntry && benchmarkExit ? returnPct(benchmarkEntry.close, benchmarkExit.close) : null;
  return { symbol: pick.symbol, horizon, entryDate: entry.date, entryPrice: entry.close, exitDate: exit.date, exitPrice: exit.close,
    returnPct: stockReturn, benchmarkSymbol: pick.benchmark_symbol || "SPY", benchmarkReturnPct: benchmarkReturn,
    excessPct: benchmarkReturn === null ? null : Math.round((stockReturn - benchmarkReturn) * 1_000) / 1_000 };
}

type Db = Pick<pg.Pool, "query">;
async function closeOnOrAfter(db: Db, table: "daily_bars" | "discovery_price_bars", symbol: string, date: string, today: string): Promise<CloseBar | null> {
  const key = table === "daily_bars" ? "ticker" : "symbol";
  const latest = addDays(date, 7) < today ? addDays(date, 7) : today;
  const result = await db.query<{ date: string; close: string }>(`SELECT bar_date::text AS date,close::text AS close FROM ${table} WHERE ${key}=$1 AND bar_date >= $2 AND bar_date <= $3 ORDER BY bar_date LIMIT 1`, [symbol, date, latest]);
  const row = result.rows[0];
  return row ? { date: row.date, close: Number(row.close) } : null;
}
async function seriesFor(db: Db, symbol: string): Promise<"daily_bars" | "discovery_price_bars" | null> {
  const result = await db.query<{ daily: boolean; discovery: boolean }>(`SELECT EXISTS(SELECT 1 FROM daily_bars WHERE ticker=$1) AS daily,
    EXISTS(SELECT 1 FROM discovery_price_bars WHERE symbol=$1) AS discovery`, [symbol]);
  return result.rows[0]?.daily ? "daily_bars" : result.rows[0]?.discovery ? "discovery_price_bars" : null;
}
export interface EtfBarProvider { bars(symbol: string): Promise<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]> }
async function refreshBars(db: Db, pick: EtfPickForOutcome, table: "daily_bars" | "discovery_price_bars", provider: EtfBarProvider): Promise<void> {
  const bars = await provider.bars(pick.symbol);
  if (table === "daily_bars") {
    await new PostgresPriceRepository(db as pg.Pool).upsertBars(pick.symbol, bars);
  } else {
    for (const bar of bars) await db.query(`INSERT INTO discovery_price_bars (symbol,name,sector,bar_date,open,high,low,close,volume)
      VALUES ($1,$2,'ETF',$3,$4,$5,$6,$7,$8) ON CONFLICT (symbol,bar_date) DO NOTHING`,
    [pick.symbol, pick.name, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume]);
  }
}

/** Read stored closes first; refresh a known US series once when a due exit is missing. */
export async function materialiseEtfOutcomes(db: Db, today: string, provider?: EtfBarProvider): Promise<{ completed: number; written: number }> {
  const rows = await db.query<EtfPickForOutcome>(`SELECT symbol,exchange,name,entry_price::text,entry_date::text,benchmark_symbol
    FROM etf_picks WHERE entry_price IS NOT NULL AND entry_date IS NOT NULL ORDER BY symbol`);
  let completed = 0, written = 0;
  for (const pick of rows.rows) {
    const due = HORIZONS.filter((days) => addDays(pick.entry_date, days) <= today);
    if (!due.length) continue;
    const table = await seriesFor(db, pick.symbol);
    if (!table) continue;
    let refreshed = false;
    const entry = await closeOnOrAfter(db, table, pick.symbol, pick.entry_date, today);
    if (!entry) continue;
    const benchmarkEntry = await closeOnOrAfter(db, "daily_bars", pick.benchmark_symbol || "SPY", entry.date, today);
    for (const days of due) {
      const target = addDays(entry.date, days);
      if (target > today) continue;
      let exit = await closeOnOrAfter(db, table, pick.symbol, target, today);
      if (!exit && !refreshed && provider && isUsListed(pick.exchange)) {
        await refreshBars(db, pick, table, provider);
        refreshed = true;
        exit = await closeOnOrAfter(db, table, pick.symbol, target, today);
      }
      if (!exit) continue;
      const benchmarkExit = benchmarkEntry ? await closeOnOrAfter(db, "daily_bars", pick.benchmark_symbol || "SPY", target, today) : null;
      const outcome = outcomeFor(pick, days, entry, exit, benchmarkEntry, benchmarkExit);
      const result = await db.query(`INSERT INTO etf_outcomes
        (symbol,horizon_days,entry_date,entry_price,exit_date,exit_price,return_pct,benchmark_symbol,benchmark_return_pct,excess_pct)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (symbol,horizon_days) DO UPDATE SET
          entry_date=EXCLUDED.entry_date,entry_price=EXCLUDED.entry_price,exit_date=EXCLUDED.exit_date,
          exit_price=EXCLUDED.exit_price,return_pct=EXCLUDED.return_pct,benchmark_symbol=EXCLUDED.benchmark_symbol,
          benchmark_return_pct=EXCLUDED.benchmark_return_pct,excess_pct=EXCLUDED.excess_pct,computed_at=now()
        WHERE (etf_outcomes.entry_date,etf_outcomes.entry_price,etf_outcomes.exit_date,etf_outcomes.exit_price,
          etf_outcomes.return_pct,etf_outcomes.benchmark_symbol,etf_outcomes.benchmark_return_pct,etf_outcomes.excess_pct)
          IS DISTINCT FROM (EXCLUDED.entry_date,EXCLUDED.entry_price,EXCLUDED.exit_date,EXCLUDED.exit_price,
          EXCLUDED.return_pct,EXCLUDED.benchmark_symbol,EXCLUDED.benchmark_return_pct,EXCLUDED.excess_pct)`,
      [outcome.symbol, outcome.horizon, outcome.entryDate, outcome.entryPrice, outcome.exitDate, outcome.exitPrice,
        outcome.returnPct, outcome.benchmarkSymbol, outcome.benchmarkReturnPct, outcome.excessPct]);
      completed++;
      written += result.rowCount ?? 0;
    }
  }
  return { completed, written };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ledger = new PostgresUsageLedger(pool);
    const provider = process.env.TWELVE_DATA_API_KEY ? new TwelveDataProvider({ apiKey: process.env.TWELVE_DATA_API_KEY,
      outputSize: 5000, reserve: () => ledger.reserve("twelvedata", 1, { job: "etf-outcomes", credits: 1 }) }) : undefined;
    return await materialiseEtfOutcomes(pool, new Date().toISOString().slice(0, 10), provider);
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])etf-outcomes\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("etf-outcomes", main);
