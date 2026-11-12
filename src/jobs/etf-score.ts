import pg from "pg";
import { scoreEtfListing, storeEtfScore } from "@/db/etf-score";
import { runLoggedJob } from "./job-log";

/** Run after ETF detail refresh. A failed listing does not prevent the remaining writes. */
export async function runEtfScore(db: pg.Pool, asOf: string) {
  const listings = await db.query<{ listing_key: string }>(`SELECT listing_key FROM etf_catalog ORDER BY listing_key`);
  let rated = 0, processed = 0, failures = 0;
  const rejections: Record<string, number> = {};
  const evidence: Record<string, number> = {};
  for (const row of listings.rows) {
    try {
      const score = await scoreEtfListing(row.listing_key, asOf, db);
      if (!score) continue;
      // Each upsert is atomic; a retry safely replaces already-written rows.
      await storeEtfScore(row.listing_key, asOf, score, db);
      processed++;
      if (score.state === "rated") rated++;
      for (const reason of score.rejections) rejections[reason] = (rejections[reason] ?? 0) + 1;
      evidence[score.evidencedMax] = (evidence[score.evidencedMax] ?? 0) + 1;
    } catch { failures++; }
  }
  // Bound history to 401 dates per listing and rule version, including unrated rows.
  const expired = await db.query(`DELETE FROM etf_scores WHERE as_of < $1::date - 400`, [asOf]);
  return { processed, rated, failures, deleted: expired.rowCount ?? 0, rejectionCounts: JSON.stringify(rejections), evidenceCounts: JSON.stringify(evidence) };
}

export async function etfScoreMain() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString, max: 2 });
  try { return await runEtfScore(db, new Date().toISOString().slice(0, 10)); }
  finally { await db.end(); }
}
if (/(?:^|[/\\])etf-score\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("etf-score", etfScoreMain);
