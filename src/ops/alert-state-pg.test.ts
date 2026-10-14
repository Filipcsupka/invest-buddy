import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PgAlertState } from "./alert-state";
import { readDatabase } from "./watchdog";

/** Needs a migrated TEST_DATABASE_URL. Uses unique keys and job names and removes them afterwards. */
const url = process.env.TEST_DATABASE_URL;
const key = `pl27-test-${process.pid}`;

describe.skipIf(!url)("watchdog tables (Postgres)", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => { await pool.query("DELETE FROM alert_state WHERE alert_key = $1", [key]); await pool.query("DELETE FROM job_runs WHERE job LIKE 'pl27-test-%'"); await pool.end(); });

  it("claims a key once per 24 hours and restores it on release", async () => {
    const state = new PgAlertState(pool);
    const t0 = new Date("2026-10-14T06:00:00Z");
    expect((await state.claim(key, "s", t0)).claimed).toBe(true);
    expect((await state.claim(key, "s", new Date("2026-10-14T12:00:00Z"))).claimed).toBe(false);
    const next = await state.claim(key, "s", new Date("2026-10-15T06:00:01Z"));
    expect(next.claimed).toBe(true);
    expect(next.previous?.toISOString()).toBe(t0.toISOString());
    await state.release(key, next.previous);
    expect((await state.claim(key, "s", new Date("2026-10-15T06:30:00Z"))).claimed).toBe(true);
    await state.release(key, null);
    expect((await pool.query("SELECT 1 FROM alert_state WHERE alert_key = $1", [key])).rowCount).toBe(0);
  });

  it("reads last good runs, exit code 5 runs, database size and health dates", async () => {
    await pool.query(`INSERT INTO job_runs (run_id, job, started_at, status, counts) VALUES
      (gen_random_uuid(), 'pl27-test-a', now() - interval '1 hour', 'ok', '{}'),
      (gen_random_uuid(), 'pl27-test-a', now() - interval '2 hours', 'failed', '{}'),
      (gen_random_uuid(), 'pl27-test-b', now() - interval '1 hour', 'failed', '{"exitCode": 5}')`);
    const data = await readDatabase(pool, new Date());
    expect(data.lastGood.has("pl27-test-a")).toBe(true);
    expect(data.lastGood.has("pl27-test-b")).toBe(false);
    expect(data.aiCeiling.map((r) => r.job)).toContain("pl27-test-b");
    expect(data.dbSizeBytes).toBeGreaterThan(0);
  });
});
