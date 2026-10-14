import type pg from "pg";
import type { EpsHistoryBatch, EpsQuarter } from "../collectors/sources/common";
import { putSnapshot } from "../data/raw-store";

export const EPS_HISTORY_SOURCE = "alphavantage";
export const epsRawKey = (ticker: string) => `earnings:${ticker}`;
export interface EpsHistoryRow extends EpsQuarter { ticker: string; observedAt: string }

const same = (a: EpsQuarter, b: EpsQuarter) => a.reportedDate === b.reportedDate && a.reportedEps === b.reportedEps && a.estimatedEps === b.estimatedEps && a.surprisePct === b.surprisePct;

/**
 * Stores the whole answer in the raw store, then one eps_history row per quarter whose values differ from the newest stored row
 * for that quarter. A revised estimate adds a row; the old row stays. Returns the rows written.
 */
export async function insertEpsHistory(db: Pick<pg.Pool, "query"> | pg.Pool, batch: EpsHistoryBatch): Promise<number> {
  if (!("connect" in db) || typeof db.connect !== "function") return insertEpsHistoryOn(db, batch);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const written = await insertEpsHistoryOn(client, batch);
    await client.query("COMMIT");
    return written;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

/** The raw snapshot and the history rows, on one connection. insertEpsHistory wraps this in a transaction, so a failed insert leaves no snapshot behind. */
async function insertEpsHistoryOn(db: Pick<pg.Pool, "query">, batch: EpsHistoryBatch): Promise<number> {
  const raw = await putSnapshot(db, { sourceId: EPS_HISTORY_SOURCE, key: epsRawKey(batch.ticker), body: batch.rawBody, contentType: "application/json", fetchedAt: new Date(batch.fetchedAt), meta: { quarters: batch.quarters.length } });
  const q = batch.quarters;
  const result = await db.query(`INSERT INTO eps_history (ticker,fiscal_date_ending,reported_date,reported_eps,estimated_eps,surprise_pct,observed_at,source_id,raw_snapshot_id)
    SELECT $1, v.f, v.rd, v.re, v.ee, v.sp, $2::timestamptz, $3, $4
    FROM unnest($5::date[],$6::date[],$7::numeric[],$8::numeric[],$9::numeric[]) AS v(f,rd,re,ee,sp)
    WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM eps_history h WHERE h.ticker=$1 AND h.fiscal_date_ending=v.f ORDER BY h.observed_at DESC LIMIT 1) n
      WHERE n.reported_date IS NOT DISTINCT FROM v.rd AND n.reported_eps IS NOT DISTINCT FROM v.re AND n.estimated_eps IS NOT DISTINCT FROM v.ee AND n.surprise_pct IS NOT DISTINCT FROM v.sp)
    ON CONFLICT (ticker,fiscal_date_ending,observed_at) DO NOTHING`,
    [batch.symbol, batch.fetchedAt, EPS_HISTORY_SOURCE, raw.id, q.map((x) => x.fiscalDateEnding), q.map((x) => x.reportedDate), q.map((x) => x.reportedEps), q.map((x) => x.estimatedEps), q.map((x) => x.surprisePct)]);
  return result.rowCount ?? 0;
}

/** Newest observed_at per symbol, as ISO UTC text. A symbol with no row is absent. Rows are only added when a value changes, so this is a proxy for the last fetch. */
export async function latestEpsObserved(db: Pick<pg.Pool, "query">): Promise<Map<string, string>> {
  const result = await db.query<{ ticker: string; observed: string }>(`SELECT ticker, to_char(max(observed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed FROM eps_history GROUP BY ticker`);
  return new Map(result.rows.map((row) => [row.ticker, row.observed]));
}

export function latestMemoryEpsObserved(store: EpsHistoryRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of store) if (row.observedAt > (out.get(row.ticker) ?? "")) out.set(row.ticker, row.observedAt);
  return out;
}

/** In-memory twin for tests. Rows carry our symbol (SQ), not the vendor ticker (XYZ). */
export function insertMemoryEpsHistory(store: EpsHistoryRow[], batch: EpsHistoryBatch): number {
  let written = 0;
  for (const quarter of batch.quarters) {
    const newest = store.filter((r) => r.ticker === batch.symbol && r.fiscalDateEnding === quarter.fiscalDateEnding).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    if (newest && same(newest, quarter)) continue;
    store.push({ ...quarter, ticker: batch.symbol, observedAt: batch.fetchedAt }); written++;
  }
  return written;
}
