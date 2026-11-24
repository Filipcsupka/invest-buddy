import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: () => async () => { throw new Error("Invariant: incrementalCache missing in unstable_cache"); }, revalidateTag: vi.fn() }));
const query = vi.fn();
vi.mock("../db/pool", () => ({ getPool: () => ({ query }) }));
import { clearWebCache } from "./web-cache";
import { instrumentUniverse, latestScores, latestScoreSummaries, warmWebCaches } from "./store";
import { ruleStreaks } from "../db/rules-streak";
import { publicHorizons } from "./public-horizons";
import { latestShareCounts } from "./flag-facts";
import { latestShortlist, latestModelPortfolio } from "./shortlist";
import { latestCrossMarketData, latestPeriodPrices } from "./cross-market-dashboard";

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => { process.env.NEXT_RUNTIME = "nodejs"; delete process.env.DATA_MODE; clearWebCache(); query.mockReset(); });
afterEach(() => { if (runtime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = runtime; });

it("fills the stocks and dashboard caches so the first visitors read memory", async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT l.ticker")) return { rows: [{ ticker: "AMD", name: "AMD", sector: "Technology", tier: 1, source: "guide", list: "core", as_of: "2026-10-14", audit: { ticker: "AMD", asOf: "2026-10-14", state: "Watch", ruleHits: [], inputs: { bars: [] } } }] };
    if (sql.includes("WITH rated AS MATERIALIZED")) return { rows: [{ listing_key: "FUND", name: "Fund", mnemonic: "FUND", vendor_symbol: "FUND.ETF", asset_class: "equity", region: "Global", tracked_index: null, ter_pct: 0.1, aum_usd_m: 100, as_of: "2026-10-14", earned: 18, evidenced_max: 25 }] };
    return { rows: [] };
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await warmWebCaches();
  const warmed = query.mock.calls.length;
  expect(warmed).toBeGreaterThanOrEqual(10);
  const shortlist = await latestShortlist();
  const market = await latestCrossMarketData();
  await Promise.all([latestScores(), latestScoreSummaries(), instrumentUniverse(), ruleStreaks(), publicHorizons(), latestShareCounts(["AMD"]),
    latestModelPortfolio("public"), latestModelPortfolio("owner"), latestPeriodPrices([], ["FUND.ETF"]), shortlist, market]);
  expect(query).toHaveBeenCalledTimes(warmed);
  expect(query.mock.calls.some(([sql, params]) => String(sql).includes("f.ticker = ANY") && JSON.stringify(params?.[0]) === '["AMD"]')).toBe(true);
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
