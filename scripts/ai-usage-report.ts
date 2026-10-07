import pg from "pg";
import { usageReport } from "../src/db/ai-usage-report";

// Prints how much of the subscription windows the AI jobs use: per-run deltas, window peaks, cutoffs.
// Usage: DATABASE_URL=... npx tsx scripts/ai-usage-report.ts
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: url });
  try {
    console.log(JSON.stringify(await usageReport(pool), null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "report failed"); process.exitCode = 1; });
