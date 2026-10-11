import pg from "pg";
import { defaultHttp } from "../collectors/sources/client";
import { runThirteenF } from "../collectors/sources/thirteenf-holdings";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { PostgresCollectorRepository } from "../db/collectors";
import { PostgresInstitutionalStore } from "../db/institutional";
import { MemoryCusipStore, PostgresCusipStore } from "../db/source-collectors";
import { loadUniverse } from "../db/universe";
import { runLoggedJob } from "./job-log";

export function parseThirteenFArgs(args: string[]) {
  const options: { dryRun: boolean; zip?: string; period?: string } = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--zip" && args[i + 1]) options.zip = args[++i];
    else if (arg === "--period" && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 1] ?? "")) options.period = args[++i];
    else throw new Error("Usage: thirteenf [--dry-run] [--zip FILE] [--period YYYY-MM-DD]");
  }
  return options;
}

/**
 * Quarterly, run by hand or by the suspended CronJobs after the 13F deadlines (2026-11-20, then after 2027-02-15).
 * `--dry-run` reads and resolves everything and prints counts, but writes nothing (not even cusip_map).
 */
async function main() {
  const options = parseThirteenFArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  requireSecUserAgent(process.env.SEC_USER_AGENT);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const companies = await loadUniverse(pool);
    const result = await runThirteenF({ http: defaultHttp(), store: new PostgresInstitutionalStore(pool), cusips: options.dryRun ? new MemoryCusipStore() : new PostgresCusipStore(pool),
      companies, now: new Date(), dryRun: options.dryRun, zipPath: options.zip, period: options.period });
    let documentsWritten = 0, factsWritten = 0;
    if (!options.dryRun) {
      const repository = new PostgresCollectorRepository(pool);
      const ids = new Map<string, number>();
      for (const doc of result.documents) { const stored = await repository.upsertDocument(doc); ids.set(doc.url, stored.id); if (stored.written) documentsWritten++; }
      for (const fact of result.facts) {
        const documentIds = fact.documentUrls.map((url) => ids.get(url)).filter((id): id is number => id !== undefined);
        if (await repository.upsertFact({ symbol: fact.symbol, key: fact.key, asOf: fact.asOf, value: fact.value, documentIds, expiresAt: fact.expiresAt })) factsWritten++;
      }
    }
    process.stdout.write(result.skipped ? `thirteenf: skip, ${result.skipped}\n`
      : `thirteenf: ${result.dataset} quarter ${result.period}, ${result.filersNew}/${result.filersFound} filers new, ${result.rowsAdded} holding rows, ${result.facts.length} facts${options.dryRun ? " (dry run, nothing stored)" : ""}\n`);
    return { filersNew: result.filersNew, rowsAdded: result.rowsAdded, documentsWritten, factsWritten, skipped: !!result.skipped };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])thirteenf\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("thirteenf", main);
