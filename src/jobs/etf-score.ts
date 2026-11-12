import pg from "pg";
import { scoreEtfListing, storeEtfScore } from "@/db/etf-score";

/** Run after ETF detail refresh, using the local database only. */
export async function runEtfScore(db: pg.Pool, asOf: string): Promise<{ processed: number; rated: number }> {
  const listings = await db.query<{ listing_key: string }>(`SELECT listing_key FROM etf_catalog ORDER BY listing_key`);
  let rated = 0;
  for (const row of listings.rows) {
    const score = await scoreEtfListing(row.listing_key, asOf, db);
    if (!score) continue;
    await storeEtfScore(row.listing_key, asOf, score, db);
    if (score.state === "rated") rated++;
  }
  return { processed: listings.rows.length, rated };
}

if (process.argv[1]?.endsWith("etf-score.ts") || process.argv[1]?.endsWith("etf-score.js")) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString, max: 2 });
  const asOf = new Date().toISOString().slice(0, 10);
  runEtfScore(db, asOf).then((result) => console.log(JSON.stringify({ asOf, ...result }))).finally(() => db.end());
}
