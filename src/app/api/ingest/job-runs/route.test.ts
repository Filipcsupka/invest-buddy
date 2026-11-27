import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PgJobRunStore } from "../../../../jobs/job-runs";
import { POST } from "./route";

const originalToken = process.env.INGEST_TOKEN;
const originalDatabase = process.env.DATABASE_URL;
const url = "http://local/api/ingest/job-runs";
const runId = randomUUID();
const startedAt = "2026-11-27T08:00:00Z";
const headers = { authorization: "Bearer job-run-test", "content-type": "application/json" };
const request = (body: unknown, requestHeaders: Record<string, string> = headers) =>
  new Request(url, { method: "POST", headers: requestHeaders, body: JSON.stringify(body) });

beforeEach(() => {
  process.env.INGEST_TOKEN = "job-run-test";
  process.env.DATABASE_URL = "postgres://localhost/job-run-test";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalToken === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = originalToken;
  if (originalDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabase;
});

it("authenticates and validates scanner lifecycle writes", async () => {
  const start = vi.spyOn(PgJobRunStore.prototype, "start").mockResolvedValue();
  const finish = vi.spyOn(PgJobRunStore.prototype, "finish").mockResolvedValue();
  const close = vi.spyOn(PgJobRunStore.prototype, "close").mockResolvedValue();
  const initial = { action: "start", runId, job: "extract", startedAt };
  expect((await POST(request(initial, {}))).status).toBe(401);
  expect((await POST(request({ ...initial, job: "untrusted" }))).status).toBe(400);
  expect((await POST(request({ ...initial, extra: "rejected" }))).status).toBe(400);
  expect((await POST(request(initial))).status).toBe(200);
  expect(start).toHaveBeenCalledWith({ runId, job: "extract", startedAt: new Date(startedAt) });
  const completed = { action: "finish", runId, job: "extract", startedAt, status: "failed", durationMs: 15, counts: { failures: 1, exitCode: 5 }, maxRssMb: 42 };
  expect((await POST(request(completed))).status).toBe(200);
  expect(finish).toHaveBeenCalledWith({ runId, job: "extract", startedAt: new Date(startedAt), status: "failed", durationMs: 15, counts: { failures: 1, exitCode: 5 }, maxRssMb: 42 });
  expect(close).toHaveBeenCalledTimes(2);
});

it("reports storage failure without exposing database details", async () => {
  vi.spyOn(PgJobRunStore.prototype, "start").mockRejectedValue(new Error("private database detail"));
  vi.spyOn(PgJobRunStore.prototype, "close").mockResolvedValue();
  const response = await POST(request({ action: "start", runId, job: "judge", startedAt }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database detail");
});
