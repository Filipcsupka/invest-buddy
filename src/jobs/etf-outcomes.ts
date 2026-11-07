import pg from "pg";
import { TwelveDataProvider } from "../data/twelvedata";
import { PostgresUsageLedger } from "../data/usage";
import { PostgresPriceRepository } from "../db/prices";
import { runLoggedJob } from "./job-log";

export const HORIZONS = [30, 60, 90, 180] as const;
export interface EtfPickForOutcome {
  symbol: string; exchange: string | null; name: string; entry_price: string; entry_date: string; benchmark_symbol: string;
  listing_key: string | null; asset_class: string; region: string | null; price_currency: string | null; catalog_currency: string | null;
}
export interface CloseBar { date: string; close: number }
type BarTable = "daily_bars" | "discovery_price_bars" | "asset_bars";
interface BarSeries { table: BarTable; symbol: string }
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const returnPct = (entry: number, exit: number) => Math.round(((exit / entry) - 1) * 100_000) / 1_000;
export const isUsListed = (exchange: string | null) => /^(?:NASDAQ|NYSE|NYSEARCA|NYSE ARCA|ARCA|AMEX|NYSE MKT|BATS|CBOE|IEX)$/i.test(exchange ?? "");

/** Use a local-currency market proxy from the index series the market-bars job already tracks. */
export function benchmarkFor(pick: EtfPickForOutcome): BarSeries | null {
  if (pick.asset_class !== "equity") return null;
  const currency = (pick.catalog_currency ?? pick.price_currency)?.toUpperCase();
  const region = pick.region?.toLowerCase().trim() ?? "";
  if (currency === "USD" && isUsListed(pick.exchange)) return { table: "daily_bars", symbol: pick.benchmark_symbol || "SPY" };
  if (currency === "EUR") {
    const regional = /\bgermany\b|\bdeutschland\b|\bdax\b/.test(region) ? "GDAXI.INDX"
      : /\bfrance\b/.test(region) ? "FCHI.INDX"
      : /\bnetherlands\b|\bdutch\b/.test(region) ? "AEX.INDX"
      : /\bspain\b/.test(region) ? "IBEX.INDX" : "STOXX50E.INDX";
    return { table: "asset_bars", symbol: regional };
  }
  const byCurrency: Record<string, string> = {
    USD: "GSPC.INDX", CHF: "SSMI.INDX", JPY: "N225.INDX", HKD: "HSI.INDX", CNY: "SSEC.INDX",
    INR: "NSEI.INDX", KRW: "KS11.INDX", AUD: "AXJO.INDX", CAD: "GSPTSE.INDX",
    BRL: "BVSP.INDX", MXN: "MXX.INDX", TWD: "TWII.INDX",
  };
  return currency && byCurrency[currency] ? { table: "asset_bars", symbol: byCurrency[currency] } : null;
}

export function outcomeFor(pick: EtfPickForOutcome, horizon: number, entry: CloseBar, exit: CloseBar, benchmarkEntry: CloseBar | null, benchmarkExit: CloseBar | null, benchmarkSymbol: string) {
  const stockReturn = returnPct(entry.close, exit.close);
  const benchmarkReturn = benchmarkEntry && benchmarkExit ? returnPct(benchmarkEntry.close, benchmarkExit.close) : null;
  return { symbol: pick.symbol, horizon, entryDate: entry.date, entryPrice: entry.close, exitDate: exit.date, exitPrice: exit.close,
    returnPct: stockReturn, benchmarkSymbol, benchmarkReturnPct: benchmarkReturn,
    excessPct: benchmarkReturn === null ? null : Math.round((stockReturn - benchmarkReturn) * 1_000) / 1_000 };
}

type Db = Pick<pg.Pool, "query">;
async function closeOnOrAfter(db: Db, table: BarTable, symbol: string, date: string, today: string): Promise<CloseBar | null> {
  const key = table === "daily_bars" ? "ticker" : table === "asset_bars" ? "vendor_symbol" : "symbol";
  const latest = addDays(date, 7) < today ? addDays(date, 7) : today;
  const result = await db.query<{ date: string; close: string }>(`SELECT bar_date::text AS date,close::text AS close FROM ${table} WHERE ${key}=$1 AND bar_date >= $2 AND bar_date <= $3 AND close > 0 ORDER BY bar_date LIMIT 1`, [symbol, date, latest]);
  const row = result.rows[0];
  return row ? { date: row.date, close: Number(row.close) } : null;
}
async function seriesFor(db: Db, pick: EtfPickForOutcome): Promise<BarSeries | null> {
  if (pick.listing_key) {
    const tracked = await db.query<{ vendor_symbol: string; currency: string | null }>(`SELECT t.vendor_symbol,a.currency FROM etf_tracked t
      JOIN tracked_assets a ON a.vendor_symbol=t.vendor_symbol WHERE t.listing_key=$1 AND a.asset_class='etf'`, [pick.listing_key]);
    const row = tracked.rows[0];
    const expectedCurrency = pick.catalog_currency ?? pick.price_currency;
    if (row && expectedCurrency && row.currency?.toUpperCase() !== expectedCurrency.toUpperCase()) return null;
    if (row) {
      const stored = await db.query<{ stored: boolean }>("SELECT EXISTS(SELECT 1 FROM asset_bars WHERE vendor_symbol=$1) AS stored", [row.vendor_symbol]);
      if (stored.rows[0]?.stored) return { table: "asset_bars", symbol: row.vendor_symbol };
    }
  }
  const result = await db.query<{ daily: boolean; discovery: boolean }>(`SELECT EXISTS(SELECT 1 FROM daily_bars WHERE ticker=$1) AS daily,
    EXISTS(SELECT 1 FROM discovery_price_bars WHERE symbol=$1) AS discovery`, [pick.symbol]);
  return result.rows[0]?.daily ? { table: "daily_bars", symbol: pick.symbol }
    : result.rows[0]?.discovery ? { table: "discovery_price_bars", symbol: pick.symbol } : null;
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
  const rows = await db.query<EtfPickForOutcome>(`SELECT p.symbol,p.exchange,p.name,p.entry_price::text,p.entry_date::text,p.benchmark_symbol,
    p.listing_key,p.asset_class,p.region,p.price_currency,c.trading_currency AS catalog_currency
    FROM etf_picks p LEFT JOIN etf_catalog c ON c.listing_key=p.listing_key
    WHERE p.entry_price IS NOT NULL AND p.entry_date IS NOT NULL ORDER BY p.symbol`);
  let completed = 0, written = 0;
  for (const pick of rows.rows) {
    const due = HORIZONS.filter((days) => addDays(pick.entry_date, days) <= today);
    if (!due.length) continue;
    const series = await seriesFor(db, pick);
    if (!series) continue;
    let refreshed = false;
    const entry = await closeOnOrAfter(db, series.table, series.symbol, pick.entry_date, today);
    if (!entry) continue;
    let benchmark = benchmarkFor(pick);
    let benchmarkEntry = benchmark ? await closeOnOrAfter(db, benchmark.table, benchmark.symbol, entry.date, today) : null;
    if (!benchmarkEntry && benchmark?.symbol === "SPY") {
      const index: BarSeries = { table: "asset_bars", symbol: "GSPC.INDX" };
      const indexEntry = await closeOnOrAfter(db, index.table, index.symbol, entry.date, today);
      if (indexEntry) { benchmark = index; benchmarkEntry = indexEntry; }
    }
    for (const days of due) {
      const target = addDays(entry.date, days);
      if (target > today) continue;
      let exit = await closeOnOrAfter(db, series.table, series.symbol, target, today);
      if (!exit && !refreshed && provider && isUsListed(pick.exchange) && series.table !== "asset_bars") {
        await refreshBars(db, pick, series.table, provider);
        refreshed = true;
        exit = await closeOnOrAfter(db, series.table, series.symbol, target, today);
      }
      if (!exit) continue;
      const benchmarkExit = benchmarkEntry && benchmark ? await closeOnOrAfter(db, benchmark.table, benchmark.symbol, target, today) : null;
      const outcome = outcomeFor(pick, days, entry, exit, benchmarkEntry, benchmarkExit, benchmark?.symbol ?? "UNAVAILABLE");
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
