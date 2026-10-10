import pg from "pg";
import { describe, expect, it } from "vitest";
import { MemoryUsageLedger } from "../data/usage";
import { MemoryBackfillStore, parseBackfillArgs, PostgresBackfillStore, registerBackfillJob, runBackfill, type BackfillJob } from "./backfill";

/** Fake source: each subject has `pages` pages, one request per page. The cursor is the next page number. */
function fakeJob(subjects: string[], pages: number, calls: string[] = [], failAt?: number): BackfillJob {
  return {
    name: "fake", source: "fake-source",
    subjects: async () => subjects,
    step: async (subject, cursor) => {
      const page = (cursor as { page: number } | null)?.page ?? 1;
      if (failAt !== undefined && calls.length === failAt) throw new Error("boom");
      calls.push(`${subject}:${page}`);
      return { cursor: { page: page + 1 }, done: page >= pages };
    }
  };
}
const ledger = (cap: number | null = null) => new MemoryUsageLedger({ "fake-source": { dailyCap: cap, monthlyCostCapEur: 0 } });

describe("runBackfill", () => {
  it("stopped after 3 requests, resumes at the 4th", async () => {
    const store = new MemoryBackfillStore(), calls: string[] = [];
    const first = await runBackfill(fakeJob(["A"], 6, calls), store, ledger(), { maxRequests: 3 });
    expect(first).toMatchObject({ status: "paused", requests: 3 });
    expect(calls).toEqual(["A:1", "A:2", "A:3"]);
    const second = await runBackfill(fakeJob(["A"], 6, calls), store, ledger());
    expect(calls.slice(3)).toEqual(["A:4", "A:5", "A:6"]);
    expect(second).toMatchObject({ status: "completed", requests: 3, subjectsDone: 1 });
    expect(await store.load("fake", "A")).toMatchObject({ status: "done" });
  });
  it("resumes after a crash at the saved cursor and keeps status failed with the reason", async () => {
    const store = new MemoryBackfillStore(), calls: string[] = [];
    const crashed = await runBackfill(fakeJob(["A"], 5, calls, 2), store, ledger());
    expect(crashed).toMatchObject({ status: "failed", requests: 3, reason: "Error" });
    expect(await store.load("fake", "A")).toEqual({ cursor: { page: 3 }, status: "failed", reason: "Error" });
    await runBackfill(fakeJob(["A"], 5, calls), store, ledger());
    expect(calls).toEqual(["A:1", "A:2", "A:3", "A:4", "A:5"]);
  });
  it("a dry run writes nothing and makes no request", async () => {
    const store = new MemoryBackfillStore(), calls: string[] = [], l = ledger();
    await store.save("fake", "A", { cursor: { page: 3 }, status: "running", reason: null });
    await store.save("fake", "B", { cursor: null, status: "done", reason: null });
    store.writes = 0;
    const result = await runBackfill(fakeJob(["A", "B", "C"], 4, calls), store, l, { dryRun: true });
    expect(result.plan).toEqual([{ subject: "A", cursor: { page: 3 } }, { subject: "C", cursor: null }]);
    expect(store.writes).toBe(0);
    expect(calls).toEqual([]);
    expect(l.rows).toEqual([]);
  });
  it("a cap stop writes status paused with the reason, and the next day resumes", async () => {
    const store = new MemoryBackfillStore(), calls: string[] = [];
    const result = await runBackfill(fakeJob(["A"], 6, calls), store, ledger(2));
    expect(result).toMatchObject({ status: "paused", requests: 2 });
    expect(result.reason).toMatch(/daily cap 2/);
    expect(await store.load("fake", "A")).toMatchObject({ status: "paused", cursor: { page: 3 }, reason: expect.stringMatching(/daily cap 2/) });
    expect(calls).toEqual(["A:1", "A:2"]);
    await runBackfill(fakeJob(["A"], 6, calls), store, ledger());
    expect(calls.slice(2)).toEqual(["A:3", "A:4", "A:5", "A:6"]);
  });
  it("reserves every request in the ledger under the backfill job name", async () => {
    const l = ledger();
    await runBackfill(fakeJob(["A", "B"], 2), new MemoryBackfillStore(), l);
    expect(l.rows).toHaveLength(4);
    expect(l.rows.every((r) => r.source === "fake-source" && r.job === "backfill:fake")).toBe(true);
  });
  it("a second runner while one is active exits without a request", async () => {
    const store = new MemoryBackfillStore(), calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: BackfillJob = { ...fakeJob(["A"], 1, calls), step: async () => { await gate; return { cursor: null, done: true }; } };
    const running = runBackfill(slow, store, ledger());
    await new Promise((r) => setTimeout(r, 5));
    const second = await runBackfill(fakeJob(["A"], 1, calls), store, ledger());
    expect(second).toMatchObject({ status: "locked", requests: 0 });
    expect(calls).toEqual([]);
    release();
    expect(await running).toMatchObject({ status: "completed" });
    expect(await runBackfill(fakeJob(["A"], 1, calls), store, ledger())).toMatchObject({ status: "completed" });
  });
  it("honours --only, rejects unknown subjects, skips finished subjects", async () => {
    const store = new MemoryBackfillStore(), calls: string[] = [];
    await runBackfill(fakeJob(["A", "B", "C"], 1, calls), store, ledger(), { only: ["B"] });
    expect(calls).toEqual(["B:1"]);
    await expect(runBackfill(fakeJob(["A"], 1), store, ledger(), { only: ["Z"] })).rejects.toThrow(/Unknown subject/);
    await runBackfill(fakeJob(["A", "B", "C"], 1, calls), store, ledger());
    expect(calls).toEqual(["B:1", "A:1", "C:1"]);
  });
  it("rejects a bad request limit", async () => {
    await expect(runBackfill(fakeJob(["A"], 1), new MemoryBackfillStore(), ledger(), { maxRequests: 0 })).rejects.toThrow(/positive whole number/);
  });
});

describe("parseBackfillArgs and registry", () => {
  it("parses the flags", () => {
    expect(parseBackfillArgs(["--job", "filings", "--only", "AAPL, MSFT", "--max-requests", "50", "--dry-run"])).toEqual({ job: "filings", only: ["AAPL", "MSFT"], maxRequests: 50, dryRun: true });
  });
  it("rejects missing job, bad numbers and unknown flags", () => {
    expect(() => parseBackfillArgs([])).toThrow(/Usage/);
    expect(() => parseBackfillArgs(["--job", "x", "--max-requests", "0"])).toThrow(/positive whole number/);
    expect(() => parseBackfillArgs(["--job", "x", "--nope"])).toThrow(/Usage/);
    expect(() => parseBackfillArgs(["--job"])).toThrow(/needs a value/);
  });
  it("refuses to register a job name twice", () => {
    registerBackfillJob("registry-test", () => fakeJob([], 1));
    expect(() => registerBackfillJob("registry-test", () => fakeJob([], 1))).toThrow(/already registered/);
  });
});

const dbDescribe = describe.skipIf(!process.env.TEST_DATABASE_URL);
dbDescribe("backfill_state (Postgres)", () => {
  const JOB = "backfill-test";
  const withPool = async (fn: (pool: pg.Pool) => Promise<void>) => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
    try { await pool.query("DELETE FROM backfill_state WHERE job=$1", [JOB]); await fn(pool); }
    finally { await pool.query("DELETE FROM backfill_state WHERE job=$1", [JOB]); await pool.end(); }
  };
  it("saves, updates and loads a cursor and status", async () => {
    await withPool(async (pool) => {
      const store = new PostgresBackfillStore(pool);
      expect(await store.load(JOB, "AAPL")).toBeNull();
      await store.save(JOB, "AAPL", { cursor: { page: 2, after: "2024-01-01" }, status: "running", reason: null });
      expect(await store.load(JOB, "AAPL")).toEqual({ cursor: { page: 2, after: "2024-01-01" }, status: "running", reason: null });
      await store.save(JOB, "AAPL", { cursor: { page: 3 }, status: "paused", reason: "daily cap 5 would be passed" });
      expect(await store.load(JOB, "AAPL")).toEqual({ cursor: { page: 3 }, status: "paused", reason: "daily cap 5 would be passed" });
      expect((await pool.query("SELECT count(*)::int AS n FROM backfill_state WHERE job=$1", [JOB])).rows[0].n).toBe(1);
    });
  });
  it("rejects an unknown status", async () => {
    await withPool(async (pool) => {
      await expect(pool.query("INSERT INTO backfill_state (job, subject, status) VALUES ($1,'X','bogus')", [JOB])).rejects.toThrow();
    });
  });
  it("only one runner holds the advisory lock; it is free again after release", async () => {
    await withPool(async (pool) => {
      const a = new PostgresBackfillStore(pool), b = new PostgresBackfillStore(pool);
      const releaseA = await a.lock(JOB);
      expect(releaseA).not.toBeNull();
      expect(await b.lock(JOB)).toBeNull();
      const releaseOther = await b.lock(`${JOB}-other`);
      expect(releaseOther).not.toBeNull();
      await releaseOther!();
      await releaseA!();
      const releaseB = await b.lock(JOB);
      expect(releaseB).not.toBeNull();
      await releaseB!();
    });
  });
  it("runs end to end against the real ledger tables with a resume", async () => {
    await withPool(async (pool) => {
      const SOURCE = "backfill-test-src";
      await pool.query("DELETE FROM api_usage WHERE source_id=$1", [SOURCE]);
      await pool.query("DELETE FROM data_sources WHERE id=$1", [SOURCE]);
      await pool.query("INSERT INTO data_sources (id,name,kind,licence_class,daily_cap) VALUES ($1,'Backfill test','other','internal_only',3)", [SOURCE]);
      try {
        const { PostgresUsageLedger } = await import("../data/usage");
        const job: BackfillJob = { name: JOB, source: SOURCE, subjects: async () => ["A"], step: async (_s, c) => { const p = (c as { page: number } | null)?.page ?? 1; return { cursor: { page: p + 1 }, done: p >= 5 }; } };
        const store = new PostgresBackfillStore(pool), ledger = new PostgresUsageLedger(pool);
        const first = await runBackfill(job, store, ledger);
        expect(first).toMatchObject({ status: "paused", requests: 3 });
        expect(await store.load(JOB, "A")).toMatchObject({ status: "paused", cursor: { page: 4 } });
        await pool.query("UPDATE data_sources SET daily_cap=NULL WHERE id=$1", [SOURCE]);
        expect(await runBackfill(job, store, ledger)).toMatchObject({ status: "completed", requests: 2 });
        expect(await store.load(JOB, "A")).toMatchObject({ status: "done" });
      } finally {
        await pool.query("DELETE FROM api_usage WHERE source_id=$1", [SOURCE]);
        await pool.query("DELETE FROM data_sources WHERE id=$1", [SOURCE]);
      }
    });
  });
});
