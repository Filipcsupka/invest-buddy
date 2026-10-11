import pg from "pg";
import { PostgresCollectorRepository } from "../db/collectors";
import { PostgresUsageLedger } from "../data/usage";
import { verifyFinding, type DocumentSink, type FindingResult, type VerifyDeps } from "../research/verify";
import type { ResearchEvidence } from "../research/types";
import { runLoggedJob, type JobCounts } from "./job-log";

type Db = Pick<pg.Pool, "query">;

export interface PendingFinding { id: number; runId: string; symbol: string; evidence: ResearchEvidence[] }

export const DEFAULT_BATCH = 200;

/** Pending findings, oldest first. */
export async function readPending(db: Db, limit = DEFAULT_BATCH): Promise<PendingFinding[]> {
  const result = await db.query<{ id: string; run_id: string; symbol: string; evidence: ResearchEvidence[] }>(
    "SELECT id, run_id, symbol, evidence FROM research_findings WHERE verification_status = 'pending' ORDER BY id LIMIT $1", [limit]);
  return result.rows.map((row) => ({ id: Number(row.id), runId: row.run_id, symbol: row.symbol, evidence: row.evidence }));
}

/** Writes one result. The model's evidence stays as written; each item gets its verify result next to it. */
export async function writeResult(db: Db, finding: PendingFinding, result: FindingResult): Promise<void> {
  const evidence = finding.evidence.map((item, index) => ({ ...item, verify: result.items[index] ?? null }));
  await db.query(
    `UPDATE research_findings SET verification_status=$2, source_class=$3, source_id=$4, snapshot_id=$5, document_id=$6, confirmed=$7,
       reading_label=$8, display_quote=$9, evidence=$10::jsonb, verified_at=now()
     WHERE id=$1 AND verification_status='pending'`,
    [finding.id, result.status, result.sourceClass, result.sourceId, result.snapshotId, result.documentId, result.confirmed,
      result.readingLabel, result.displayQuote, JSON.stringify(evidence)]);
}

/** verified_count: verified or lead_only. dropped_count: quote not found, blocked or stale. A failed fetch is neither: it stays a lead for the owner. */
export async function updateRunCounts(db: Db, runIds: string[]): Promise<void> {
  if (!runIds.length) return;
  await db.query(
    `UPDATE research_runs r SET
       findings_count = c.total, verified_count = c.verified, dropped_count = c.dropped
     FROM (SELECT run_id, count(*)::int AS total,
             count(*) FILTER (WHERE verification_status IN ('verified','lead_only'))::int AS verified,
             count(*) FILTER (WHERE verification_status IN ('quote_not_found','blocked','stale'))::int AS dropped
           FROM research_findings WHERE run_id = ANY($1::uuid[]) GROUP BY run_id) c
     WHERE r.id = c.run_id`, [runIds]);
}

export interface VerifyJobResult { findings: number; verified: number; confirmed: number; leadOnly: number; failed: number; skipped?: string }

/** Verifies pending findings. A failed fetch never fails the job: the finding ends as fetch_failed. */
export async function runResearchVerify(db: Db, deps: VerifyDeps = {}, limit = DEFAULT_BATCH): Promise<VerifyJobResult> {
  const out: VerifyJobResult = { findings: 0, verified: 0, confirmed: 0, leadOnly: 0, failed: 0 };
  const ready = await db.query<{ tables: boolean; source: boolean }>(
    `SELECT to_regclass('public.research_findings') IS NOT NULL AS tables,
            EXISTS (SELECT 1 FROM data_sources WHERE id = 'research_web') AS source`);
  if (!ready.rows[0]?.tables || !ready.rows[0]?.source) return { ...out, skipped: "research tables or the research_web source row are not migrated yet" };
  const pending = await readPending(db, limit);
  const runs = new Set<string>();
  for (const finding of pending) {
    let result: FindingResult;
    try { result = await verifyFinding(finding, { ...deps, db }); }
    catch { out.failed++; continue; }
    await writeResult(db, finding, result);
    runs.add(finding.runId);
    out.findings++;
    if (result.status === "verified") out.verified++;
    if (result.status === "lead_only") out.leadOnly++;
    if (result.confirmed) out.confirmed++;
  }
  await updateRunCounts(db, [...runs]);
  return out;
}

/** Document sink that leaves the symbol empty when it is not an instrument (source_documents.symbol has a foreign key). */
export function documentSink(pool: pg.Pool): DocumentSink {
  const repository = new PostgresCollectorRepository(pool);
  return {
    async upsertDocument(doc) {
      const known = doc.symbol ? (await pool.query("SELECT 1 FROM instruments WHERE ticker = $1", [doc.symbol])).rowCount : 0;
      return repository.upsertDocument(known ? doc : { ...doc, symbol: null, meta: { ...doc.meta, research_symbol: doc.symbol } });
    },
  };
}

async function main(): Promise<JobCounts> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await runResearchVerify(pool, { ledger: new PostgresUsageLedger(pool), documents: documentSink(pool) });
    process.stdout.write(result.skipped ? `research-verify: skip, ${result.skipped}\n` : `research-verify: ${result.findings} findings, ${result.verified} verified (${result.confirmed} confirmed), ${result.leadOnly} lead only\n`);
    return { ...result, skipped: !!result.skipped };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])research-verify\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("research-verify", main);
