import type pg from "pg";
import { getPool } from "./pool";
import { forwardReturn, hitRate, WINDOWS, type Close, type WindowDays } from "../track-record/measure";

export interface RecordSignal {
  id: number;
  ticker: string;
  asOf: string;
  source: "score" | "judge";
  tier: string;
  state: string;
  score: number | null;
  windows: Record<WindowDays, ReturnType<typeof forwardReturn>>;
}

export interface RecordHistory {
  snapshotCount: number;
  firstDate: string | null;
  lastDate: string | null;
  signals: RecordSignal[];
  buySignalCount: number;
  hit20: ReturnType<typeof hitRate>;
}

type SignalRow = { id: string; ticker: string; as_of: string; source: "score" | "judge"; tier: string; state: string; score: number | null; reference_close: string | null; spy_reference_close: string | null };

export async function readRecord(pool: Pick<pg.Pool, "query">, today: string): Promise<RecordHistory> {
  const summary = await pool.query<{ count: string; first_date: string | null; last_date: string | null }>(
    "SELECT count(*)::text AS count,min(as_of)::text AS first_date,max(as_of)::text AS last_date FROM record_snapshots");
  const rows = await pool.query<SignalRow>(`SELECT id::text,ticker,as_of::text,source,tier,state,score,reference_close::text,spy_reference_close::text
    FROM record_signals WHERE as_of <= $1 ORDER BY as_of DESC,id DESC`, [today]);
  const tickers = [...new Set(rows.rows.map((row) => row.ticker))];
  const first = rows.rows.at(-1)?.as_of;
  const bars = first ? await pool.query<{ ticker: string; date: string; close: string }>(
    "SELECT ticker,bar_date::text AS date,close::text FROM daily_bars WHERE ticker = ANY($1::text[]) AND bar_date >= $2 AND bar_date <= $3 ORDER BY ticker,bar_date",
    [[...tickers, "SPY"], first, today]) : { rows: [] };
  const byTicker = new Map<string, Close[]>();
  for (const row of bars.rows) {
    const series = byTicker.get(row.ticker) ?? [];
    series.push({ date: row.date, close: Number(row.close) });
    byTicker.set(row.ticker, series);
  }
  const spy = byTicker.get("SPY") ?? [];
  const spyAtDate = new Map(spy.map((bar) => [bar.date, bar.close]));
  const signals: RecordSignal[] = rows.rows.map((row) => {
    const laterStoredSpyClose = spyAtDate.get(row.as_of) ?? null;
    const series = byTicker.get(row.ticker) ?? [];
    const laterStoredTickerClose = series.find((bar) => bar.date === row.as_of)?.close ?? null;
    const base = { asOf: row.as_of, tickerClose: row.reference_close === null ? laterStoredTickerClose : Number(row.reference_close), spyClose: row.spy_reference_close === null ? laterStoredSpyClose : Number(row.spy_reference_close) };
    return { id: Number(row.id), ticker: row.ticker, asOf: row.as_of, source: row.source, tier: row.tier, state: row.state, score: row.score,
      windows: Object.fromEntries(WINDOWS.map((days) => [days, forwardReturn(base, series, spy, days, today)])) as RecordSignal["windows"] };
  });
  const uniqueBuys = new Map<string, RecordSignal>();
  for (const signal of signals) {
    if (signal.tier === "BROKEN") continue;
    const key = `${signal.ticker}:${signal.asOf}`;
    if (!uniqueBuys.has(key)) uniqueBuys.set(key, signal);
  }
  return { snapshotCount: Number(summary.rows[0]?.count ?? 0), firstDate: summary.rows[0]?.first_date ?? null,
    lastDate: summary.rows[0]?.last_date ?? null, signals, buySignalCount: uniqueBuys.size,
    hit20: hitRate([...uniqueBuys.values()].map((signal) => signal.windows[20]?.excess ?? null)) };
}

export async function recordHistory(): Promise<RecordHistory> {
  const empty: RecordHistory = { snapshotCount: 0, firstDate: null, lastDate: null, signals: [], buySignalCount: 0, hit20: { hits: 0, n: 0, rate: null } };
  const pool = getPool();
  if (!pool) return empty;
  return readRecord(pool, new Date().toISOString().slice(0, 10));
}
