import type pg from "pg";
import type { OHLCV } from "../engine";

export interface PriceRunRecord {
  provider: string; startedAt: string; requested: number; succeeded: number; failed: number; barsWritten: number; barsRevised: number;
  failures: { ticker: string; reason: string }[]; stoppedReason: string | null;
}
/** Where a batch of bars came from: registry id and the symbol the vendor was asked for. */
export interface BarProvenance { sourceId: string; vendorSymbol: string }
export interface UpsertResult { written: number; revised: number }
export interface BarRevision extends OHLCV { ticker: string; observedAt: string; sourceId: string; kind: "first" | "superseded" }
export interface PriceRepository {
  /** Number of stored bars dated on or after `date`. */
  countSince(ticker: string, date: string): Promise<number>;
  /** Upsert bars; `written` = rows inserted or changed, `revised` = stored bars whose old values were logged because they changed. */
  upsertBars(ticker: string, bars: OHLCV[], provenance?: BarProvenance): Promise<UpsertResult>;
  recordRun(run: PriceRunRecord): Promise<void>;
}

export class MemoryPriceRepository implements PriceRepository {
  readonly bars = new Map<string, Map<string, OHLCV>>();
  readonly runs: PriceRunRecord[] = [];
  /** Source of the last write per ticker. */
  readonly provenance = new Map<string, BarProvenance>();
  /** Append-only revision log, same content as daily_bar_revisions. */
  readonly revisions: BarRevision[] = [];
  private readonly observed = new Map<string, string>();
  async countSince(ticker: string, date: string) { return [...(this.bars.get(ticker)?.keys() ?? [])].filter((d) => d >= date).length; }
  async upsertBars(ticker: string, bars: OHLCV[], provenance: BarProvenance = { sourceId: "twelvedata", vendorSymbol: ticker }) {
    const store = this.bars.get(ticker) ?? new Map<string, OHLCV>();
    const observedAt = new Date().toISOString();
    let changed = 0, revised = 0;
    for (const bar of bars) {
      const old = store.get(bar.date);
      const key = `${ticker}|${bar.date}`;
      if (!old) {
        this.revisions.push({ ...bar, ticker, observedAt, sourceId: provenance.sourceId, kind: "first" });
      } else if (old.open !== bar.open || old.high !== bar.high || old.low !== bar.low || old.close !== bar.close || old.volume !== bar.volume) {
        this.revisions.push({ ...old, ticker, observedAt: this.observed.get(key) ?? observedAt, sourceId: this.provenance.get(ticker)?.sourceId ?? provenance.sourceId, kind: "superseded" });
        revised++;
      } else continue;
      store.set(bar.date, { ...bar });
      this.observed.set(key, observedAt);
      changed++;
    }
    this.bars.set(ticker, store);
    if (changed) this.provenance.set(ticker, provenance);
    return { written: changed, revised };
  }
  async recordRun(run: PriceRunRecord) { this.runs.push(structuredClone(run)); }
}

export class PostgresPriceRepository implements PriceRepository {
  constructor(private readonly pool: pg.Pool) {}
  async countSince(ticker: string, date: string) {
    const result = await this.pool.query<{ n: string }>("SELECT count(*) AS n FROM daily_bars WHERE ticker=$1 AND bar_date >= $2", [ticker, date]);
    return Number(result.rows[0]?.n ?? 0);
  }
  async upsertBars(ticker: string, bars: OHLCV[], provenance: BarProvenance = { sourceId: "twelvedata", vendorSymbol: ticker }) {
    if (!bars.length) return { written: 0, revised: 0 };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const arrays = [bars.map((b) => b.date), bars.map((b) => b.open), bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close), bars.map((b) => b.volume)];
      const source = `FROM unnest($2::date[],$3::numeric[],$4::numeric[],$5::numeric[],$6::numeric[],$7::numeric[]) AS t(d,o,h,l,c,v)`;
      // Bars never stored before: keep the values as first seen.
      await client.query(`INSERT INTO daily_bar_revisions (ticker,bar_date,observed_at,open,high,low,close,volume,source_id,kind)
        SELECT $1, d, now(), o, h, l, c, v, $8::text, 'first' ${source}
        WHERE NOT EXISTS (SELECT 1 FROM daily_bars b WHERE b.ticker=$1 AND b.bar_date=d)`, [ticker, ...arrays, provenance.sourceId]);
      // Stored bars about to be replaced: keep the old values, with the time they were fetched.
      const revised = await client.query(`INSERT INTO daily_bar_revisions (ticker,bar_date,observed_at,open,high,low,close,volume,source_id,kind)
        SELECT b.ticker, b.bar_date, COALESCE(b.fetched_at, now()), b.open, b.high, b.low, b.close, b.volume, COALESCE(b.source_id, $8::text), 'superseded'
        FROM daily_bars b JOIN (SELECT d,o,h,l,c,v ${source}) n ON n.d=b.bar_date
        WHERE b.ticker=$1 AND (b.open,b.high,b.low,b.close,b.volume) IS DISTINCT FROM (n.o,n.h,n.l,n.c,n.v)`, [ticker, ...arrays, provenance.sourceId]);
      const result = await client.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume,source_id,vendor_symbol,fetched_at)
        SELECT $1, d, o, h, l, c, v, $8::text, $9::text, now() ${source}
        ON CONFLICT (ticker,bar_date) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume,
          source_id=EXCLUDED.source_id,vendor_symbol=EXCLUDED.vendor_symbol,fetched_at=EXCLUDED.fetched_at
        WHERE (daily_bars.open,daily_bars.high,daily_bars.low,daily_bars.close,daily_bars.volume) IS DISTINCT FROM (EXCLUDED.open,EXCLUDED.high,EXCLUDED.low,EXCLUDED.close,EXCLUDED.volume)`,
        [ticker, ...arrays, provenance.sourceId, provenance.vendorSymbol]);
      await client.query("COMMIT");
      return { written: result.rowCount ?? 0, revised: revised.rowCount ?? 0 };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async recordRun(run: PriceRunRecord) {
    await this.pool.query(`INSERT INTO price_ingest_runs (provider,started_at,requested_count,succeeded_count,failed_count,bars_written,bars_revised,failures,stopped_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [run.provider, run.startedAt, run.requested, run.succeeded, run.failed, run.barsWritten, run.barsRevised, JSON.stringify(run.failures), run.stoppedReason]);
  }
}
