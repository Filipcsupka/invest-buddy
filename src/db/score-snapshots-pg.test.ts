import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresScoreRepository } from "./postgres";
import { runDaily } from "../jobs/daily";
import { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } from "../data/fixtures";
import { replaySnapshot } from "./score-replay";
import type { SnapshotRow } from "./score-snapshots";

// Needs a migrated TEST_DATABASE_URL. Uses a ticker unique to this run, so counts are exact; the append-only rows it writes stay in the test database.
const DATE = "2025-08-08";

describe("score_input_snapshots (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("writes one row per distinct fingerprint, replays it, and blocks updates", async () => {
    const ticker = `SN${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const nvda = instruments.find((i) => i.ticker === "NVDA")!;
    const provider = (guidanceRaised: boolean | null) => ({ instruments: async () => [{ ...nvda, ticker }], bars: async () => fixtureBars("NVDA"), fundamentals: async () => ({ ...fixtureFundamentals("NVDA"), guidanceRaised }), macro: async () => fixtureMacro("NVDA") });
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const repository = new PostgresScoreRepository(pool);
    const count = async () => Number((await pool.query("SELECT count(*) AS n FROM score_input_snapshots WHERE ticker=$1 AND as_of=$2", [ticker, DATE])).rows[0].n);
    try {
      await runDaily(provider(true), repository, DATE);
      await runDaily(provider(true), repository, DATE);
      expect(await count()).toBe(1);
      await runDaily(provider(false), repository, DATE);
      expect(await count()).toBe(2);

      const row = (await pool.query("SELECT ticker,as_of::text,rules_version,inputs_fingerprint,inputs,bars_hash,bar_last_date::text FROM score_input_snapshots WHERE ticker=$1 AND as_of=$2 ORDER BY observed_at DESC, id DESC LIMIT 1", [ticker, DATE])).rows[0];
      const stored = (await pool.query("SELECT audit,inputs_fingerprint FROM score_results WHERE ticker=$1 AND as_of=$2", [ticker, DATE])).rows[0];
      expect(stored.inputs_fingerprint).toBe(row.inputs_fingerprint);
      const snapshot: SnapshotRow = { ticker: row.ticker, asOf: row.as_of, rulesVersion: row.rules_version, inputsFingerprint: row.inputs_fingerprint, inputs: row.inputs, barsHash: row.bars_hash, barLastDate: row.bar_last_date };
      expect(replaySnapshot(snapshot, fixtureBars("NVDA"), stored.audit)).toMatchObject({ ok: true, differences: [] });

      await expect(pool.query("UPDATE score_input_snapshots SET rules_version='x' WHERE ticker=$1", [ticker])).rejects.toThrow(/immutable/);
      await expect(pool.query("DELETE FROM score_input_snapshots WHERE ticker=$1", [ticker])).rejects.toThrow(/immutable/);
      await expect(pool.query("TRUNCATE score_input_snapshots")).rejects.toThrow(/immutable/);
    } finally { await pool.end(); }
  });
});
