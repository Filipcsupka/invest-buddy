import pg from "pg";
import { getText } from "../collectors/http";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { refreshMaster } from "../data/master-refresh";
import { runLoggedJob } from "./job-log";

/** Weekly refresh of the security master from SEC (company_tickers.json and submissions). Usage: tsx src/jobs/master-refresh.ts [--dry-run] */
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) throw new Error("Usage: tsx src/jobs/master-refresh.ts [--dry-run]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  requireSecUserAgent(process.env.SEC_USER_AGENT);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const dryRun = args.includes("--dry-run");
    const result = await refreshMaster(pool, { get: (url) => getText(url), today: new Date().toISOString().slice(0, 10), dryRun });
    for (const c of result.changes) process.stdout.write(`${c.ticker}: ${c.kind} ${c.field} ${c.from ?? "null"} -> ${c.to ?? "null"}${dryRun ? " (dry run)" : ""}\n`);
    for (const f of result.failures) process.stderr.write(`${f.ticker}: ${f.reason}\n`);
    process.stdout.write(`master-refresh: ${result.checked} checked, ${result.changes.length} changes, ${result.failures.length} failures\n`);
    if (result.failures.length) process.exitCode = 1;
    return { requested: result.checked, changes: result.changes.length, failures: result.failures.length };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])master-refresh\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("master-refresh", main);
