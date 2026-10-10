import pg from "pg";
import { loadUniverse } from "../db/universe";
import { defaultHttp } from "../collectors/sources/client";
import { collectEarningsCalendar, KEY_VARIABLE } from "../collectors/sources/alphavantage-calendar";
import { PostgresUsageLedger } from "../data/usage";
import { runLoggedJob } from "./job-log";

export function parseCalendarArgs(args: string[]) {
  const options = { dryRun: false, force: false };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else throw new Error(`Unknown earnings-calendar option ${arg}`);
  }
  return options;
}

/** Daily: one Alpha Vantage EARNINGS_CALENDAR request. No key or a reached cap prints skip and exits 0. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const options = parseCalendarArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const universe = (await loadUniverse(pool)).map((row) => row.symbol);
    const result = await collectEarningsCalendar(pool, defaultHttp(), new PostgresUsageLedger(pool), { key: process.env[KEY_VARIABLE], universe, ...options });
    process.stdout.write(result.skipped ? `earnings-calendar: skip, ${result.skipped}\n`
      : `earnings-calendar: ${result.rows} rows, ${result.universeRows} universe, ${result.inserted} inserted${options.dryRun ? " (dry run)" : ""}\n`);
    return { requests: result.requests, rows: result.rows, universeRows: result.universeRows, inserted: result.inserted, skipped: !!result.skipped };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])earnings-calendar\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("earnings-calendar", main);
