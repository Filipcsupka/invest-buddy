import pg from "pg";
import { readRecord } from "../db/track-record";
import { runLoggedJob } from "./job-log";

/** Stores each completed window of every recorded signal once. A rerun inserts nothing new. */
export async function materialiseOutcomes(pool: Pick<pg.Pool, "query">, today: string): Promise<{ completed: number; inserted: number }> {
  const record = await readRecord(pool, today, { stored: false });
  let completed = 0, inserted = 0;
  for (const signal of record.signals) {
    for (const [days, result] of Object.entries(signal.windows)) {
      if (!result) continue;
      completed++;
      const res = await pool.query(`INSERT INTO record_outcomes (signal_id,window_days,exit_date,stock_return,spy_return,excess_return)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (signal_id,window_days) DO NOTHING`,
      [signal.id, Number(days), result.date, result.stock, result.spy, result.excess]);
      inserted += res.rowCount ?? 0;
    }
  }
  return { completed, inserted };
}

/** Usage: tsx src/jobs/outcomes.ts */
async function main() {
  if (process.argv.length > 2) throw new Error("Usage: tsx src/jobs/outcomes.ts");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await materialiseOutcomes(pool, new Date().toISOString().slice(0, 10));
    process.stdout.write(`outcomes: ${result.completed} completed windows, ${result.inserted} new\n`);
    return result;
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])outcomes\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("outcomes", main);
