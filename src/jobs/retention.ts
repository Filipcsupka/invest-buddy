import { runLoggedJob } from "./job-log";
import pg from "pg";
import { freshnessDays } from "../data/evidence";
import { purgeIdeas } from "./retention-ideas";
import { purgeUnconfirmedWaitlist } from "./retention-waitlist";
import { purgeJobRuns } from "./retention-job-runs";

/** SQL CASE giving the evidence window per consensus field, built from `freshnessDays` so it cannot drift from the verifier. */
export const windowCase = `CASE c.field ${Object.entries(freshnessDays).map(([field, days]) => `WHEN '${field}' THEN ${days}`).join(" ")} ELSE 30 END`;

export const expiredDocuments = `FROM source_documents d WHERE d.expires_at < now()
  AND NOT EXISTS (SELECT 1 FROM consensus_findings c
    WHERE c.as_of + ${windowCase} >= current_date
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.evidence_refs) ref WHERE ref->>'url'=d.url))
  AND NOT EXISTS (SELECT 1 FROM trade_ideas i WHERE i.expires_at > now()
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.evidence_urls) ref WHERE ref->>'url'=d.url))
  AND NOT EXISTS (SELECT 1 FROM extraction_runs r WHERE r.expires_at > now() AND r.output IS NOT NULL
    AND jsonb_path_exists(r.output, '$.** ? (@ == $url)', jsonb_build_object('url', d.url)))`;
export const expiredExtractionRuns = "FROM extraction_runs WHERE expires_at < now()";
/** Rows of these classes are archived, never deleted: public SEC filings and other public-government data. Everything else is deleted when it expires. */
export const archiveDocumentClass = "(d.source = 'edgar' OR d.licence_class = 'public_gov')";
export const archiveFactClass = "licence_class = 'public_gov'";
const docColumns = "id,source,symbol,doc_type,url,published_at,fetched_at,content_hash,body,meta,expires_at,source_id,licence_class,display_allowed";
const factColumns = "id,symbol,fact_key,as_of,value,document_ids,computed_at,expires_at,source_id,licence_class";
type Query = { query: (sql: string) => Promise<{ rows: { count: number }[]; rowCount: number | null }> };
export interface ArchiveCounts { archivedDocuments: number; deletedDocuments: number; archivedFacts: number; deletedFacts: number }
/** Runs inside the caller's transaction. Public-gov rows move to the archive tables in the same statement that removes them; other expired rows are deleted. Dry run only counts. */
export async function retainExpired(client: Query, dryRun: boolean): Promise<ArchiveCounts> {
  const expiredFacts = "FROM collected_facts WHERE expires_at < now()";
  const count = async (sql: string) => (await client.query(`SELECT count(*)::int AS count ${sql}`)).rows[0].count;
  const move = async (from: string, table: string, columns: string, prefix: string) => (await client.query(
    `WITH moved AS (DELETE ${from} RETURNING ${columns.split(",").map((c) => prefix + c).join(",")}),
      archived AS (INSERT INTO ${table}_archive (${columns}) SELECT ${columns} FROM moved ON CONFLICT (id) DO NOTHING RETURNING 1)
      SELECT count(*)::int AS count FROM moved`)).rows[0].count;
  const remove = async (sql: string) => (await client.query(`DELETE ${sql}`)).rowCount ?? 0;
  const docArchive = `${expiredDocuments} AND ${archiveDocumentClass}`;
  const docDelete = `${expiredDocuments} AND NOT ${archiveDocumentClass}`;
  const factArchive = `${expiredFacts} AND ${archiveFactClass}`;
  const factDelete = `${expiredFacts} AND NOT (${archiveFactClass})`;
  if (dryRun) return { archivedDocuments: await count(docArchive), deletedDocuments: await count(docDelete), archivedFacts: await count(factArchive), deletedFacts: await count(factDelete) };
  return {
    archivedDocuments: await move(docArchive, "source_documents", docColumns, "d."),
    deletedDocuments: await remove(docDelete),
    archivedFacts: await move(factArchive, "collected_facts", factColumns, ""),
    deletedFacts: await remove(factDelete),
  };
}
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
    const kept = await retainExpired(client, dryRun);
    const runs = await purgeExtractionRuns(client, dryRun);
    const ideas = await purgeIdeas(client, dryRun);
    const waitlist = await purgeUnconfirmedWaitlist(client, dryRun);
    const jobRuns = await purgeJobRuns(client, dryRun);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    process.stdout.write(`${JSON.stringify({ dryRun, facts: kept.archivedFacts + kept.deletedFacts, documents: kept.archivedDocuments + kept.deletedDocuments, ...kept, extractionRuns: runs, ideas, waitlist, jobRuns })}\n`);
    return { facts: kept.archivedFacts + kept.deletedFacts, documents: kept.archivedDocuments + kept.deletedDocuments, archivedDocuments: kept.archivedDocuments, archivedFacts: kept.archivedFacts, extractionRuns: runs, tradeIdeas: ideas.tradeIdeas, judgeRuns: ideas.judgeRuns, jobRuns, failures: 0 };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
if (/(?:^|[/\\])retention\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("retention", main);
