import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PgJobRunStore } from "./job-runs";
import { purgeJobRuns } from "./retention-job-runs";

/** Needs a migrated TEST_DATABASE_URL. Rows use a unique job name and are removed afterwards. */
const url = process.env.TEST_DATABASE_URL;
const job = `pl26-test-${process.pid}`;

describe.skipIf(!url)("job_runs (Postgres)", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => { await pool.query("DELETE FROM job_runs WHERE job = $1", [job]); await pool.end(); });

  it("inserts a running row and updates it at the end", async () => {
    const store = new PgJobRunStore(url!);
    const run = { runId: "11111111-1111-4111-8111-111111111111", job, startedAt: new Date() };
    try {
      await store.start(run);
      expect((await pool.query("SELECT status, ended_at FROM job_runs WHERE run_id = $1", [run.runId])).rows[0]).toMatchObject({ status: "running", ended_at: null });
      await store.finish({ ...run, status: "partial", durationMs: 1200, counts: { failures: 1 }, maxRssMb: 150 });
      expect((await pool.query("SELECT status, duration_ms, counts, max_rss_mb FROM job_runs WHERE run_id = $1", [run.runId])).rows[0]).toEqual({ status: "partial", duration_ms: 1200, counts: { failures: 1 }, max_rss_mb: 150 });
    } finally { await store.close(); }
  });

  it("writes the row at the end when the start insert was lost", async () => {
    const store = new PgJobRunStore(url!);
    const runId = "22222222-2222-4222-8222-222222222222";
    try {
      await store.finish({ runId, job, startedAt: new Date(), status: "ok", durationMs: 5, counts: {}, maxRssMb: 90 });
      expect((await pool.query("SELECT status FROM job_runs WHERE run_id = $1", [runId])).rows[0].status).toBe("ok");
    } finally { await store.close(); }
  });

  it("retention deletes rows older than 400 days only", async () => {
    await pool.query("INSERT INTO job_runs (run_id, job, started_at, status) VALUES ('33333333-3333-4333-8333-333333333333', $1, now() - interval '401 days', 'ok'), ('44444444-4444-4444-8444-444444444444', $1, now() - interval '399 days', 'ok')", [job]);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      expect(await purgeJobRuns(client, true)).toBeGreaterThanOrEqual(1);
      expect(await purgeJobRuns(client, false)).toBeGreaterThanOrEqual(1);
      await client.query("COMMIT");
    } finally { client.release(); }
    const left = (await pool.query("SELECT run_id FROM job_runs WHERE run_id IN ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444')")).rows;
    expect(left).toEqual([{ run_id: "44444444-4444-4444-8444-444444444444" }]);
  });
});
