import pg from "pg";
import type { OHLCV, ScoreResult } from "../src/engine";
import { replaySnapshot } from "../src/db/score-replay";
import type { SnapshotRow } from "../src/db/score-snapshots";

// Read-only. Rebuilds a score from score_input_snapshots and compares it with score_results.
// Usage: DATABASE_URL=... npx tsx scripts/replay-score.ts TICKER YYYY-MM-DD [--all]
// Without --all only the newest snapshot of that ticker and date is replayed, which is the one score_results holds.
// Bars come from daily_bars; if they changed since the snapshot, the report says so (barsMatch false).
async function main() {
  const [ticker, date, ...flags] = process.argv.slice(2);
  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || flags.some((flag) => flag !== "--all")) throw new Error("Usage: replay-score.ts TICKER YYYY-MM-DD [--all]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = await pool.query<{ ticker: string; as_of: string; rules_version: string; inputs_fingerprint: string; inputs: SnapshotRow["inputs"]; bars_hash: string; bar_last_date: string | null }>(
      "SELECT ticker,as_of::text,rules_version,inputs_fingerprint,inputs,bars_hash,bar_last_date::text FROM score_input_snapshots WHERE ticker=$1 AND as_of=$2 ORDER BY observed_at DESC, id DESC", [ticker.toUpperCase(), date]);
    if (!rows.rows.length) throw new Error(`No snapshot for ${ticker} on ${date}`);
    const bars = (await pool.query<{ bar_date: string; open: string; high: string; low: string; close: string; volume: string }>(
      "SELECT bar_date::text,open,high,low,close,volume FROM daily_bars WHERE ticker=$1 AND bar_date <= $2 ORDER BY bar_date", [ticker.toUpperCase(), date])).rows
      .map((row): OHLCV => ({ date: row.bar_date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
    const stored = (await pool.query<{ audit: ScoreResult; inputs_fingerprint: string }>("SELECT audit,inputs_fingerprint FROM score_results WHERE ticker=$1 AND as_of=$2", [ticker.toUpperCase(), date])).rows[0];
    let failed = false;
    for (const row of flags.includes("--all") ? rows.rows : rows.rows.slice(0, 1)) {
      const snapshot: SnapshotRow = { ticker: row.ticker, asOf: row.as_of, rulesVersion: row.rules_version, inputsFingerprint: row.inputs_fingerprint, inputs: row.inputs, barsHash: row.bars_hash, barLastDate: row.bar_last_date };
      // Only the snapshot that matches the stored score can be compared with it.
      const report = replaySnapshot(snapshot, bars, stored && stored.inputs_fingerprint === row.inputs_fingerprint ? stored.audit : null);
      failed ||= !report.ok;
      process.stdout.write(`${JSON.stringify({ ticker: row.ticker, asOf: row.as_of, rulesVersion: row.rules_version, fingerprint: row.inputs_fingerprint.slice(0, 12), ...report }, null, 2)}\n`);
    }
    if (failed) process.exitCode = 1;
  } finally { await pool.end(); }
}

void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : error}\n`); process.exitCode = 1; });
