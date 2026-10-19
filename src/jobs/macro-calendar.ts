import pg from "pg";
import { defaultHttp, type SourceHttp } from "../collectors/sources/client";
import { collectMacroSchedule } from "../collectors/sources/macro-schedule";
import { replaceMacroSchedule } from "../db/macro-events";
import { runLoggedJob } from "./job-log";

export function parseMacroCalendarArgs(args: string[]) {
  const options = { dryRun: false };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown macro-calendar option ${arg}`);
  }
  return options;
}

export interface MacroCalendarDeps { http: Pick<SourceHttp, "get">; db: Pick<pg.ClientBase, "query"> | null; now: Date; userAgent: string | undefined; dryRun: boolean }

/** Reads the BLS and Fed schedules and stores each kind that was read. A kind that failed keeps its stored rows. */
export async function runMacroCalendar(deps: MacroCalendarDeps) {
  const today = deps.now.toISOString().slice(0, 10);
  const collected = await collectMacroSchedule(deps.http, today, deps.userAgent);
  const failures = [...collected.failures];
  let written = 0, removed = 0;
  for (const result of collected.results) {
    if (deps.dryRun || !deps.db) continue;
    try {
      const stored = await replaceMacroSchedule(deps.db, result.kind, result.releases, today);
      written += stored.written; removed += stored.removed;
    } catch (error) { failures.push(`${result.kind} store: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const kinds = Object.fromEntries(collected.results.map((result) => [result.kind, result.releases.length]));
  return { today, kinds, failures, requests: collected.requests, written, removed };
}

/** Daily: three BLS schedule pages and the Fed calendar file into macro_events. No Twelve Data or Alpha Vantage request. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const options = parseMacroCalendarArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const result = await runMacroCalendar({ http: defaultHttp(), db: client, now: new Date(), userAgent: process.env.SEC_USER_AGENT, dryRun: options.dryRun });
    const counts = Object.entries(result.kinds).map(([kind, n]) => `${kind} ${n}`).join(", ") || "none";
    process.stdout.write(`macro-calendar: upcoming ${counts}; ${result.written} written, ${result.removed} removed${options.dryRun ? " (dry run)" : ""}\n`);
    for (const failure of result.failures) process.stderr.write(`macro-calendar: ${failure}\n`);
    // Every source failing means the stored calendar is going stale: fail the run so the watchdog sees it.
    if (!Object.keys(result.kinds).length) process.exitCode = 1;
    return { requests: result.requests, written: result.written, removed: result.removed, kinds: Object.keys(result.kinds).length, failures: result.failures.length };
  } finally { client.release(); await pool.end(); }
}

if (/(?:^|[/\\])macro-calendar\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("macro-calendar", main);
