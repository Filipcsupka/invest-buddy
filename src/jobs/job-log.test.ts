import { afterEach, describe, expect, it, vi } from "vitest";
import { runLoggedJob } from "./job-log";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

describe("job lifecycle logging", () => {
  it("records start, end, duration and counts", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    await runLoggedJob("daily", async () => ({ instruments: 35, failures: 0 }));
    const [start, end] = lines.map((line) => JSON.parse(line));
    expect(start).toMatchObject({ event: "job_start", job: "daily" });
    expect(end).toMatchObject({ event: "job_end", job: "daily", status: "ok", counts: { instruments: 35, failures: 0 } });
    expect(end.runId).toBe(start.runId);
    expect(end.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a failed end without an error message", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    await runLoggedJob("collect", async () => { throw new Error("secret-token"); });
    expect(JSON.parse(lines[0])).toMatchObject({ event: "job_end", job: "collect", status: "failed", failures: 1 });
    expect(lines.join("")).not.toContain("secret-token");
    expect(process.exitCode).toBe(1);
  });
});

describe("job_runs storage", () => {
  type Call = { step: "start" | "finish"; run: Record<string, unknown> };
  function fakeStore(options: { failStart?: boolean; failFinish?: boolean } = {}) {
    const calls: Call[] = [];
    let closed = 0;
    const store = {
      async start(run: Record<string, unknown>) { calls.push({ step: "start", run }); if (options.failStart) throw new Error("connect ECONNREFUSED postgres://u:secret@db"); },
      async finish(run: Record<string, unknown>) { calls.push({ step: "finish", run }); if (options.failFinish) throw new Error("secret"); },
      async close() { closed += 1; },
    };
    return { store: store as unknown as import("./job-runs").JobRunStore, calls, closed: () => closed };
  }
  const quiet = () => {
    const out: string[] = []; const err: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((l) => { out.push(String(l)); return true; });
    vi.spyOn(process.stderr, "write").mockImplementation((l) => { err.push(String(l)); return true; });
    return { out, err };
  };

  it("stores a run at start and its result at the end, with peak memory", async () => {
    const { out } = quiet();
    const { store, calls, closed } = fakeStore();
    await runLoggedJob("daily", async () => ({ instruments: 3, failures: 0 }), { store, maxRssMb: () => 210 });
    expect(calls.map((c) => c.step)).toEqual(["start", "finish"]);
    expect(calls[1].run).toMatchObject({ job: "daily", status: "ok", counts: { instruments: 3, failures: 0 }, maxRssMb: 210 });
    expect(calls[1].run.runId).toBe(JSON.parse(out[0]).runId);
    expect(closed()).toBe(1);
  });

  it("stores partial when the job reports failures", async () => {
    quiet();
    const { store, calls } = fakeStore();
    await runLoggedJob("collect", async () => ({ failures: 2 }), { store });
    expect(calls[1].run).toMatchObject({ status: "partial" });
  });

  it("stores failed when the job throws, and keeps exit code 1", async () => {
    quiet();
    const { store, calls } = fakeStore();
    await runLoggedJob("collect", async () => { throw new Error("boom"); }, { store });
    expect(calls[1].run).toMatchObject({ status: "failed", counts: {} });
    expect(process.exitCode).toBe(1);
  });

  it("stores failed when the job sets a non-zero exit code", async () => {
    quiet();
    const { store, calls } = fakeStore();
    await runLoggedJob("alert-test", async () => { process.exitCode = 1; return { failures: 1 }; }, { store });
    expect(calls[1].run).toMatchObject({ status: "failed" });
  });

  it("does not fail the job when the database is down, and logs no error text", async () => {
    const { err, out } = quiet();
    const { store } = fakeStore({ failStart: true, failFinish: true });
    await runLoggedJob("daily", async () => ({ instruments: 1 }), { store });
    expect(process.exitCode ?? 0).toBe(0);
    expect(JSON.parse(out[1])).toMatchObject({ event: "job_end", status: "ok" });
    expect(err.map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ event: "job_run_store_failed", step: "start", reason: "Error" }),
      expect.objectContaining({ event: "job_run_store_failed", step: "finish", reason: "Error" }),
    ]);
    expect(err.join("")).not.toContain("secret");
  });

  it("keeps the job's own failure exit code when the database is down", async () => {
    quiet();
    const { store } = fakeStore({ failStart: true, failFinish: true });
    await runLoggedJob("daily", async () => { throw new Error("x"); }, { store });
    expect(process.exitCode).toBe(1);
  });

  it("stores a non-zero exit code in counts without changing the log line", async () => {
    const { out } = quiet();
    const { store, calls } = fakeStore();
    await runLoggedJob("judge", async () => { process.exitCode = 5; return { failures: 0 }; }, { store });
    expect(calls[1].run).toMatchObject({ status: "failed", counts: { failures: 0, exitCode: 5 } });
    expect(JSON.parse(out[1]).counts).toEqual({ failures: 0 });
  });

  it("writes nothing when no store is configured", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((l) => { lines.push(String(l)); return true; });
    await runLoggedJob("daily", async () => ({}), { store: null });
    expect(lines).toHaveLength(2);
  });
});
