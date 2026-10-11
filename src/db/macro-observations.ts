import type pg from "pg";
import type { MacroObservation } from "../collectors/macro-observations";

/** One stored vintage of a value is kept only when it differs from the newest stored vintage of the same observation; a revision gets its own row. Returns the number of rows written. */
export async function insertMacroObservations(db: Pick<pg.Pool, "query">, rows: MacroObservation[]): Promise<number> {
  if (!rows.length) return 0;
  const result = await db.query(`INSERT INTO macro_observations (series_id,obs_date,value,realtime_start,source_id,source_url)
    SELECT v.series_id,v.obs_date,v.value,v.realtime_start,v.source_id,v.source_url
    FROM unnest($1::text[],$2::date[],$3::numeric[],$4::date[],$5::text[],$6::text[]) AS v(series_id,obs_date,value,realtime_start,source_id,source_url)
    WHERE v.value IS DISTINCT FROM (SELECT m.value FROM macro_observations m WHERE m.series_id=v.series_id AND m.obs_date=v.obs_date ORDER BY m.realtime_start DESC LIMIT 1)
    ON CONFLICT DO NOTHING`,
    [rows.map((r) => r.seriesId), rows.map((r) => r.obsDate), rows.map((r) => r.value), rows.map((r) => r.realtimeStart), rows.map((r) => r.sourceId), rows.map((r) => r.sourceUrl)]);
  return result.rowCount ?? 0;
}

/** Newest `limit` observations of one series up to `asOf`, newest vintage per date, oldest first. */
export async function storedMacroSeries(db: Pick<pg.Pool, "query">, seriesId: string, asOf: string, limit: number): Promise<{ date: string; value: number }[]> {
  const res = await db.query<{ date: string; value: number }>(
    `SELECT date, value FROM (SELECT DISTINCT ON (obs_date) obs_date::text AS date, value::float8 AS value FROM macro_observations
       WHERE series_id=$1 AND obs_date <= $2::date ORDER BY obs_date, realtime_start DESC) t ORDER BY date DESC LIMIT $3`, [seriesId, asOf, limit]);
  return res.rows.reverse();
}

/** In-memory twin of insertMacroObservations for tests. */
export function insertMemoryMacroObservations(store: MacroObservation[], rows: MacroObservation[]): number {
  let written = 0;
  for (const row of rows) {
    const newest = store.filter((s) => s.seriesId === row.seriesId && s.obsDate === row.obsDate).sort((a, b) => b.realtimeStart.localeCompare(a.realtimeStart))[0];
    if (newest && newest.value === row.value) continue;
    if (store.some((s) => s.seriesId === row.seriesId && s.obsDate === row.obsDate && s.realtimeStart === row.realtimeStart)) continue;
    store.push({ ...row }); written++;
  }
  return written;
}
