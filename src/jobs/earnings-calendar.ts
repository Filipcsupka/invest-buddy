import pg from "pg";
import { loadUniverse } from "../db/universe";
import { defaultHttp } from "../collectors/sources/client";
import { collectEarningsCalendar, KEY_VARIABLE } from "../collectors/sources/alphavantage-calendar";
import { PostgresUsageLedger } from "../data/usage";
import { runLoggedJob } from "./job-log";

/** Include stored pool names, the latest private baseline, and research still under review. */
export async function loadAdditionalCalendarSymbols(db: Pick<pg.Pool, "query">, asOf: string): Promise<string[]> {
  const result = await db.query<{ symbol: string }>(`SELECT DISTINCT symbol FROM (
    SELECT symbol FROM discovery_price_bars
    UNION ALL SELECT symbol FROM discovery_candidates WHERE status IN ('pending', 'approved')
    UNION ALL SELECT p.value->>'symbol' AS symbol FROM portfolio_baseline b
      CROSS JOIN LATERAL jsonb_array_elements(b.positions) AS p(value)
      WHERE b.as_of = (SELECT max(as_of) FROM portfolio_baseline WHERE as_of <= $1::date)
    UNION ALL SELECT symbol FROM research_candidates WHERE state <> 'DROPPED'
  ) selected WHERE symbol IS NOT NULL AND symbol <> '' ORDER BY symbol`, [asOf]);
  return result.rows.map((row) => row.symbol);
}

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
    const asOf = new Date().toISOString().slice(0, 10);
    const universe = (await loadUniverse(pool, asOf, { collect: true })).map((row) => row.symbol);
    const additionalSymbols = await loadAdditionalCalendarSymbols(pool, asOf);
    const result = await collectEarningsCalendar(pool, defaultHttp(), new PostgresUsageLedger(pool), { key: process.env[KEY_VARIABLE], universe, additionalSymbols, ...options });
    process.stdout.write(result.skipped ? `earnings-calendar: skip, ${result.skipped}\n`
      : `earnings-calendar: ${result.rows} rows, ${result.universeRows} universe, ${result.coveredRows} covered, ${result.inserted} inserted${options.dryRun ? " (dry run)" : ""}\n`);
    return { requests: result.requests, rows: result.rows, universeRows: result.universeRows, coveredRows: result.coveredRows, inserted: result.inserted, skipped: !!result.skipped };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])earnings-calendar\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("earnings-calendar", main);
