/** Read-only comparison using the same band thresholds; the v3 coverage cap applies only to v3. */
import pg from "pg";
import { etfScore } from "../src/engine/etf-score";
import { etfBand } from "../src/engine/etf-bands";
import { loadEtfBenchmarkReturns, loadEtfPeerPercentiles, readEtfScoreFactsBatch } from "../src/db/etf-score";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("Expected YYYY-MM-DD");
async function main() {
const db = new pg.Pool({ connectionString, options: "-c default_transaction_read_only=on", max: 4 });
const labels = ["rulesMet", "mostlyMet", "partlyMet", "fewMet", "notRated"] as const;
const counts = () => Object.fromEntries(labels.map((label) => [label, 0])) as Record<(typeof labels)[number], number>;
const v2 = counts(), v3 = counts();
const add = (bucket: typeof v2, band: keyof typeof v2) => { bucket[band]++; };
try {
  const readOnly = await db.query<{ default_transaction_read_only: string }>("SHOW default_transaction_read_only");
  if (readOnly.rows[0]?.default_transaction_read_only !== "on") throw new Error("Read-only session required");
  const old = await db.query<{ listing_key: string; earned: number; evidenced_max: number; state: string }>(`SELECT DISTINCT ON (listing_key) listing_key,earned,evidenced_max,state FROM etf_scores WHERE rules_version='etf-v2-2026-11-12' AND as_of<=$1::date ORDER BY listing_key,as_of DESC`, [asOf]);
  for (const row of old.rows) {
    if (row.state !== "rated" || !Number(row.evidenced_max)) add(v2, "notRated");
    else add(v2, etfBand(Math.round(Number(row.earned) / Number(row.evidenced_max) * 100), 100).band);
  }
  const listings = await db.query<{ listing_key: string }>("SELECT listing_key FROM etf_catalog ORDER BY listing_key");
  const [peers, benchmarks] = await Promise.all([loadEtfPeerPercentiles(asOf, db), loadEtfBenchmarkReturns(asOf, db)]);
  for (let offset = 0; offset < listings.rows.length; offset += 50) {
    const keys = listings.rows.slice(offset, offset + 50).map((row) => row.listing_key);
    const facts = await readEtfScoreFactsBatch(keys, asOf, db, peers, benchmarks);
    for (const key of keys) { const f = facts.get(key); const score = f ? etfScore(f) : null; add(v3, score?.band ?? "notRated"); }
  }
  console.log(JSON.stringify({ asOf, v2, v3 }, null, 2));
} finally { await db.end(); }

}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
