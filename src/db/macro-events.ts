import type pg from "pg";
import type { ScheduledRelease } from "../collectors/sources/macro-schedule";
import type { MacroEventKind } from "../data/macro-calendar";

/**
 * Stores one kind's schedule as read today. Rows of that kind dated on or after `today` that the page no longer lists are removed,
 * so a moved release does not leave its old date behind. Past rows stay. Call it only with a non-empty list from a page that was read.
 * Runs in one transaction, so pass a dedicated client, not a pool. Returns the number of rows inserted or changed and the number removed.
 */
export async function replaceMacroSchedule(db: Pick<pg.ClientBase, "query">, kind: MacroEventKind, releases: ScheduledRelease[], today: string): Promise<{ written: number; removed: number }> {
  const rows = releases.filter((release) => release.kind === kind && release.date >= today);
  if (!rows.length) throw new Error(`macro_events: no ${kind} rows on or after ${today}`);
  await db.query("BEGIN");
  try {
    const removed = await db.query("DELETE FROM macro_events WHERE kind=$1 AND event_date >= $2::date AND NOT (event_date = ANY($3::date[]))", [kind, today, rows.map((r) => r.date)]);
    const written = await db.query(`INSERT INTO macro_events (kind,event_date,label,reference_period,release_time,source_id,source_url)
      SELECT $1,v.event_date,v.label,v.reference_period,v.release_time,v.source_id,v.source_url
      FROM unnest($2::date[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[]) AS v(event_date,label,reference_period,release_time,source_id,source_url)
      ON CONFLICT (kind,event_date) DO UPDATE SET label=EXCLUDED.label, reference_period=EXCLUDED.reference_period, release_time=EXCLUDED.release_time,
        source_id=EXCLUDED.source_id, source_url=EXCLUDED.source_url, fetched_at=now()
      WHERE (macro_events.label, macro_events.reference_period, macro_events.release_time, macro_events.source_url)
        IS DISTINCT FROM (EXCLUDED.label, EXCLUDED.reference_period, EXCLUDED.release_time, EXCLUDED.source_url)`,
    [kind, rows.map((r) => r.date), rows.map((r) => r.label), rows.map((r) => r.referencePeriod), rows.map((r) => r.releaseTime), rows.map((r) => r.sourceId), rows.map((r) => r.sourceUrl)]);
    await db.query("COMMIT");
    return { written: written.rowCount ?? 0, removed: removed.rowCount ?? 0 };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
