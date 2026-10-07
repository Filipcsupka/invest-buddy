import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { GET, POST } from "./route";

it.skipIf(!process.env.TEST_DATABASE_URL)("keeps quota samples owner-only and reports them", async () => {
  const oldDb = process.env.DATABASE_URL, oldToken = process.env.INGEST_TOKEN;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.INGEST_TOKEN = "quota-route-test-token";
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const runId = randomUUID(), url = "http://local/api/ingest/ai-budget?report=usage";
  const authorized = { authorization: "Bearer quota-route-test-token", "content-type": "application/json" };
  try {
    expect((await GET(new Request(url))).status).toBe(401);
    const body = { action: "sample", job: "extract", runId, phase: "start", fiveHourPct: 12.5, sevenDayPct: 32.5, fiveHourResetAt: null, sevenDayResetAt: null };
    expect((await POST(new Request(url, { method: "POST", headers: authorized, body: JSON.stringify(body) }))).status).toBe(200);
    const report = await (await GET(new Request(url, { headers: authorized }))).json();
    expect(report.liveUsage.runs.some((run: { runId: string }) => run.runId === runId)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("quota-route-test-token");
  } finally {
    await pool.query("DELETE FROM ai_quota_samples WHERE run_id=$1", [runId]);
    await pool.end();
    if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
    if (oldToken === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = oldToken;
  }
});
