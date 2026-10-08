import pg from "pg";
import { usageReport } from "../src/db/ai-usage-report";

// Prints how much of the subscription windows the AI jobs use: per-run deltas, window peaks, cutoffs.
// Usage: DATABASE_URL=... npx tsx scripts/ai-usage-report.ts
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: url });
  try {
    const report = await usageReport(pool);
    const rows = await pool.query(`SELECT symbol,as_of::text AS as_of,model,status,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,cost_usd,created_at
      FROM extraction_runs WHERE created_at >= now() - interval '30 days' ORDER BY created_at DESC LIMIT 500`);
    console.log(JSON.stringify({ ...report, extractionRuns: rows.rows }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "report failed"); process.exitCode = 1; });
