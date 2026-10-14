import pg from "pg";
import { PostgresWaitlistRepository, type CountRow } from "../src/db/waitlist";

// Owner report for the waitlist: counts only. No email address is read, printed or exported.
// Usage: DATABASE_URL=... npm run waitlist:report

export interface WaitlistReport {
  total: number;
  byStatus: Record<string, number>;
  byLocale: Record<string, number>;
  bySource: Record<string, number>;
  byPriceVariant: Record<string, number>;
  weeklyConsent: number;
}

const add = (target: Record<string, number>, key: string, n: number) => { target[key || "(none)"] = (target[key || "(none)"] ?? 0) + n; };

export function buildReport(rows: CountRow[]): WaitlistReport {
  const report: WaitlistReport = { total: 0, byStatus: {}, byLocale: {}, bySource: {}, byPriceVariant: {}, weeklyConsent: 0 };
  for (const row of rows) {
    report.total += row.count;
    add(report.byStatus, row.status, row.count);
    add(report.byLocale, row.locale, row.count);
    add(report.bySource, row.source, row.count);
    add(report.byPriceVariant, row.priceVariant, row.count);
    // Only confirmed people who ticked the weekly box count; the weekly mail goes to nobody else.
    if (row.status === "confirmed" && row.consentWeekly) report.weeklyConsent += row.count;
  }
  return report;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    process.stdout.write(`${JSON.stringify(buildReport(await new PostgresWaitlistRepository(pool).counts()), null, 2)}\n`);
  } finally { await pool.end(); }
}

if (process.argv[1]?.endsWith("waitlist-report.ts")) main().catch((error) => { console.error(error); process.exitCode = 1; });
