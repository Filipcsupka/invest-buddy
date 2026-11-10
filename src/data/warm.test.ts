import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: () => async () => { throw new Error("Invariant: incrementalCache missing in unstable_cache"); }, revalidateTag: vi.fn() }));
const query = vi.fn();
vi.mock("../db/pool", () => ({ getPool: () => ({ query }) }));
import { clearWebCache } from "./web-cache";
import { instrumentUniverse, latestScores, latestScoreSummaries, warmWebCaches } from "./store";

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => { process.env.NEXT_RUNTIME = "nodejs"; delete process.env.DATA_MODE; clearWebCache(); query.mockReset(); });
afterEach(() => { if (runtime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = runtime; });

it("fills the listing caches so the first visitors read memory", async () => {
  query.mockResolvedValue({ rows: [] });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await warmWebCaches();
  const warmed = query.mock.calls.length;
  expect(warmed).toBeGreaterThanOrEqual(2);
  await Promise.all([latestScores(), latestScoreSummaries(), instrumentUniverse()]);
  expect(query).toHaveBeenCalledTimes(warmed);
  expect(log).toHaveBeenCalledWith(expect.stringContaining("\"failed\":0"));
  log.mockRestore();
});

it("does not throw when the database is down", async () => {
  query.mockRejectedValue(new Error("connect ECONNREFUSED"));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(warmWebCaches()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith(expect.stringContaining("web_cache_warm"));
  log.mockRestore();
});

it("is skipped in fixture mode", async () => {
  process.env.DATA_MODE = "fixture";
  await warmWebCaches();
  expect(query).not.toHaveBeenCalled();
});
