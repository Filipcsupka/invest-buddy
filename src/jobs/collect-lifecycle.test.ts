import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryCollectorRepository } from "../db/collectors";

const state = vi.hoisted(() => ({
  repo: undefined as MemoryCollectorRepository | undefined,
  query: vi.fn(async () => ({ rows: [] })),
  end: vi.fn(async () => {}),
  collect: vi.fn(async () => []),
}));
vi.mock("pg", () => ({ default: { Pool: class { query = state.query; end = state.end; } } }));
vi.mock("../db/universe", () => ({ loadUniverse: async () => [{ symbol: "NVDA", name: "Nvidia" }, { symbol: "AMD", name: "AMD" }] }));
vi.mock("../data/security-master", async (original) => ({
  ...await original<typeof import("../data/security-master")>(),
  loadStoredCiks: async () => new Map(), loadVendorSymbols: async () => ({}),
}));
vi.mock("../db/collectors", async (original) => {
  const actual = await original<typeof import("../db/collectors")>();
  return { ...actual, PostgresCollectorRepository: class extends actual.MemoryCollectorRepository {
    constructor() { super(); state.repo = this; }
  } };
});
vi.mock("../collectors/edgar", async (original) => ({
  ...await original<typeof import("../collectors/edgar")>(),
  companyCiks: async () => new Map([["NVDA", 1045810], ["AMD", 2488]]),
  collectEdgar: state.collect,
}));

import { collectTimeBudget, runCollectJob } from "./collect";
import { runLoggedJob, type JobCounts } from "./job-log";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://fixture/fixture");
  vi.stubEnv("SEC_USER_AGENT", "InvestBuddy ops@example.com");
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "collect.test.ts", "--source", "edgar"]);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  state.end.mockClear(); state.collect.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); process.exitCode = 0; });

describe("collector process shutdown", () => {
  it("records once and closes the collector and job pools before signal termination", async () => {
    const controller = new AbortController();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<[]>();
    state.collect.mockImplementationOnce(async () => { entered.resolve(); return release.promise; });
    const close = vi.fn(async () => {});
    const finish = vi.fn(async () => {});
    const terminate = vi.fn(() => {
      expect(state.end).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    });
    let collecting: Promise<JobCounts> | undefined;
    const running = runLoggedJob("collect", () => (collecting = runCollectJob(controller.signal)), {
      signal: controller.signal, onSignal: async () => await collecting ?? {},
      store: { start: async () => {}, finish, close }, terminate,
    });
    await entered.promise;
    controller.abort();
    expect(state.end).not.toHaveBeenCalled();
    release.resolve([]);
    await running;
    expect(state.collect).toHaveBeenCalledOnce();
    expect(state.repo?.runs).toHaveLength(1);
    expect(state.repo?.runs[0]).toMatchObject({ succeeded: 1, stoppedReason: "SIGTERM received" });
    expect(finish).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "partial", counts: expect.objectContaining({ succeeded: 1 }) }));
    expect(terminate).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it("keeps the finished collector row intact if signalled during pool.end", async () => {
    const controller = new AbortController();
    state.end.mockImplementationOnce(async () => { controller.abort(); });
    let collecting: Promise<JobCounts> | undefined;
    const terminate = vi.fn();
    const close = vi.fn(async () => {});
    await runLoggedJob("collect", () => (collecting = runCollectJob(controller.signal)), {
      signal: controller.signal, onSignal: async () => await collecting ?? {},
      store: { start: async () => {}, finish: async () => {}, close }, terminate,
    });
    expect(state.repo?.runs).toHaveLength(1);
    expect(state.repo?.runs[0]).toMatchObject({ succeeded: 2, stoppedReason: null });
    expect(state.end).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it("defaults to 1500 seconds and rejects invalid budget values", () => {
    expect(collectTimeBudget(undefined)).toBe(1500);
    expect(collectTimeBudget("90")).toBe(90);
    for (const value of ["", "0", "-1", "NaN", "Infinity"]) expect(() => collectTimeBudget(value)).toThrow(/COLLECT_TIME_BUDGET_SECONDS/);
  });
});
