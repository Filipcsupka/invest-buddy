import pg from "pg";
import { purgeIdeas } from "./retention-ideas";

export const expiredDocuments = `FROM source_documents d WHERE d.expires_at < now()
  AND NOT EXISTS (SELECT 1 FROM consensus_findings c
    WHERE c.as_of + CASE WHEN c.field IN ('revenueAccelerating','revenueDeclining','epsBeat','guidanceRaised','guidanceCut') THEN 100
      WHEN c.field = 'insiderOrInstitutionalBuying' THEN 60 ELSE 30 END >= current_date
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.evidence_refs) ref WHERE ref->>'url'=d.url))
  AND NOT EXISTS (SELECT 1 FROM trade_ideas i WHERE i.expires_at > now()
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.evidence_urls) ref WHERE ref->>'url'=d.url))
  AND NOT EXISTS (SELECT 1 FROM extraction_runs r WHERE r.expires_at > now() AND r.output IS NOT NULL
    AND jsonb_path_exists(r.output, '$.** ? (@ == $url)', jsonb_build_object('url', d.url)))`;
export const expiredExtractionRuns = "FROM extraction_runs WHERE expires_at < now()";
/** Runs inside the caller's transaction. Dry run counts, otherwise deletes. */
export async function purgeExtractionRuns(client: { query: (sql: string) => Promise<{ rows: { count: number }[]; rowCount: number | null }> }, dryRun: boolean): Promise<number> {
  if (dryRun) return (await client.query(`SELECT count(*)::int AS count ${expiredExtractionRuns}`)).rows[0].count;
  return (await client.query(`DELETE ${expiredExtractionRuns}`)).rowCount ?? 0;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) throw new Error("Usage: retention [--dry-run]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const dryRun = args.includes("--dry-run");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const facts = dryRun ? await client.query("SELECT count(*)::int AS count FROM collected_facts WHERE expires_at < now()")
      : await client.query("DELETE FROM collected_facts WHERE expires_at < now()");
    const docs = dryRun ? await client.query(`SELECT count(*)::int AS count ${expiredDocuments}`)
      : await client.query(`DELETE ${expiredDocuments}`);
    const runs = await purgeExtractionRuns(client, dryRun);
    const ideas = await purgeIdeas(client, dryRun);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    process.stdout.write(`${JSON.stringify({ dryRun, facts: dryRun ? facts.rows[0].count : facts.rowCount, documents: dryRun ? docs.rows[0].count : docs.rowCount, extractionRuns: runs, ideas })}\n`);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
if (/(?:^|[/\\])retention\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
