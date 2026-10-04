import type pg from "pg";
import type { OHLCV } from "../engine";

export interface PriceRunRecord {
  provider: string; startedAt: string; requested: number; succeeded: number; failed: number; barsWritten: number;
  failures: { ticker: string; reason: string }[]; stoppedReason: string | null;
}
export interface PriceRepository {
  /** Number of stored bars dated on or after `date`. */
  countSince(ticker: string, date: string): Promise<number>;
  /** Upsert bars; returns the number of rows inserted or changed. */
  upsertBars(ticker: string, bars: OHLCV[]): Promise<number>;
  recordRun(run: PriceRunRecord): Promise<void>;
}

export class MemoryPriceRepository implements PriceRepository {
  readonly bars = new Map<string, Map<string, OHLCV>>();
  readonly runs: PriceRunRecord[] = [];
  async countSince(ticker: string, date: string) { return [...(this.bars.get(ticker)?.keys() ?? [])].filter((d) => d >= date).length; }
  async upsertBars(ticker: string, bars: OHLCV[]) {
    const store = this.bars.get(ticker) ?? new Map<string, OHLCV>();
    let changed = 0;
    for (const bar of bars) {
      const old = store.get(bar.date);
      if (!old || old.open !== bar.open || old.high !== bar.high || old.low !== bar.low || old.close !== bar.close || old.volume !== bar.volume) { store.set(bar.date, { ...bar }); changed++; }
    }
    this.bars.set(ticker, store);
    return changed;
  }
  async recordRun(run: PriceRunRecord) { this.runs.push(structuredClone(run)); }
}

export class PostgresPriceRepository implements PriceRepository {
  constructor(private readonly pool: pg.Pool) {}
  async countSince(ticker: string, date: string) {
    const result = await this.pool.query<{ n: string }>("SELECT count(*) AS n FROM daily_bars WHERE ticker=$1 AND bar_date >= $2", [ticker, date]);
    return Number(result.rows[0]?.n ?? 0);
  }
  async upsertBars(ticker: string, bars: OHLCV[]) {
    if (!bars.length) return 0;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume)
        SELECT $1, d, o, h, l, c, v FROM unnest($2::date[],$3::numeric[],$4::numeric[],$5::numeric[],$6::numeric[],$7::numeric[]) AS t(d,o,h,l,c,v)
        ON CONFLICT (ticker,bar_date) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume
        WHERE (daily_bars.open,daily_bars.high,daily_bars.low,daily_bars.close,daily_bars.volume) IS DISTINCT FROM (EXCLUDED.open,EXCLUDED.high,EXCLUDED.low,EXCLUDED.close,EXCLUDED.volume)`,
        [ticker, bars.map((b) => b.date), bars.map((b) => b.open), bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close), bars.map((b) => b.volume)]);
      await client.query("COMMIT");
      return result.rowCount ?? 0;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async recordRun(run: PriceRunRecord) {
    await this.pool.query(`INSERT INTO price_ingest_runs (provider,started_at,requested_count,succeeded_count,failed_count,bars_written,failures,stopped_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [run.provider, run.startedAt, run.requested, run.succeeded, run.failed, run.barsWritten, JSON.stringify(run.failures), run.stoppedReason]);
  }
}
