import pg from "pg";
import type { OHLCV } from "../engine";

type SpyBar = { date: string; close: string };

/** Index SPY closes to 100 on the first stored session in the record range. */
export function buildRecordBenchmark(rows: SpyBar[]): OHLCV[] {
  const bars = rows
    .map((row) => ({ date: row.date, close: Number(row.close) }))
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const base = bars[0]?.close;
  if (!base) return [];
  return bars.map((bar) => {
    const close = Number((100 * bar.close / base).toFixed(4));
    return { date: bar.date, open: close, high: close, low: close, close, volume: 0 };
  });
}

export async function readRecordBenchmark(pool: Pick<pg.Pool, "query">, firstDate: string, lastDate: string): Promise<OHLCV[]> {
  const result = await pool.query<SpyBar>(
    "SELECT bar_date::text AS date,close::text FROM daily_bars WHERE ticker='SPY' AND bar_date >= $1 AND bar_date <= $2 ORDER BY bar_date",
    [firstDate, lastDate],
  );
  return buildRecordBenchmark(result.rows);
}

export async function recordBenchmark(firstDate: string | null, lastDate: string | null): Promise<OHLCV[]> {
  if (!firstDate || !lastDate || !process.env.DATABASE_URL) return [];
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try { return await readRecordBenchmark(pool, firstDate, lastDate); }
  finally { await pool.end(); }
}
