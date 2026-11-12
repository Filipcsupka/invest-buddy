import { describe, expect, it } from "vitest";
import type { ShortlistData } from "@/data/shortlist";
import { latestShortlist } from "@/data/shortlist";
import type { ShortlistRow } from "@/engine/shortlist";
import type { SectorGroup } from "@/universe/sector-groups";
import { assembleCrossMarket, assemblePeriodRows, indexMetrics, latestCrossMarketData, latestPeriodPrices, parseDashboardPeriod, returnOverPeriod, selectDashboardFunds, selectDashboardStocks, type DashboardFund } from "./cross-market-dashboard";

const asOf = "2026-11-10";
const sectors: SectorGroup[] = ["Technology", "Healthcare", "Industrials", "Financial Services", "Energy", "Utilities"];
function shortlist(rows: ShortlistRow[]): ShortlistData {
  return { shortlist: { asOf, kept: rows } as ShortlistData["shortlist"], concentration: { total: 0, thresholdPercent: 30, groups: [], unknownCount: 0 }, names: Object.fromEntries(rows.map((row) => [row.ticker, `Company ${row.ticker}`])), sample: false };
}
function stock(index: number, sector: SectorGroup, passed = true): ShortlistRow {
  return { ticker: `S${index}`, sector, percent: 95 - index, checks: [
    { id: "evidence", gate: "F1", status: "pass", reason: "EVIDENCE_OK" },
    { id: "rs", gate: "F2", status: passed ? "pass" : "not-assessed", reason: passed ? "RS_OK" : "RS_UNKNOWN" },
    { id: "liquidity", gate: "F2", status: "pass", reason: "LIQUIDITY_OK" },
  ] } as ShortlistRow;
}
const fund = (key: string, assetClass: string, trackedIndex: string | null, scorePercent = 90, region = "Global", terPercent: number | null = 0.1): DashboardFund =>
  ({ key, name: key, symbol: key, assetClass, region, trackedIndex, scorePercent, terPercent, aumUsdM: 1200, asOf: "2026-11-06" });

describe("cross-market dashboard assembly", () => {
  it("keeps only F1 and F2 passes, at most three names per sector and fifteen overall", () => {
    const rows = [stock(0, "Technology", false), ...Array.from({ length: 24 }, (_, index) => stock(index + 1, sectors[Math.floor(index / 4) % sectors.length]))];
    const result = selectDashboardStocks(shortlist(rows));
    expect(result.stocks).toHaveLength(15);
    expect(result.stocks).not.toContainEqual(expect.objectContaining({ ticker: "S0" }));
    expect(result.stocks.filter((row) => row.sector === "Technology")).toHaveLength(3);
    expect(result.stocks.every((row) => row.asOf === asOf)).toBe(true);
    expect(result.concentration.total).toBe(15);
    expect(result.concentration.groups.every((group) => !group.flagged)).toBe(true);
  });

  it("deduplicates core funds by tracked index and excludes narrow or costly entries", () => {
    const selected = selectDashboardFunds([
      fund("a", "equity", "World", 92), fund("b", "equity", "world", 91), fund("c", "equity", "US 500", 85, "United States"),
      fund("d", "equity", "Europe", 95, "Europe"), fund("e", "equity", "World 2", 95, "Global", 0.3),
      fund("f", "bond", "Aggregate", 90), fund("g", "multi_asset", "Balanced", 82), fund("h", "bond", "Short", 79),
    ]);
    expect(selected.core.map((item) => item.key)).toEqual(["a", "c"]);
    expect(selected.defensive.map((item) => item.key)).toEqual(["f", "g", "h"]);
    expect(selected.core[0].asOf).toBe("2026-11-06");
  });

  it("computes dated index context and returns empty sleeves when ratings are absent", () => {
    const bars = Array.from({ length: 253 }, (_, index) => 100 + index * 0.1 + Math.sin(index / 7));
    const metrics = indexMetrics(bars);
    expect(metrics.aboveMa200).toBe(true);
    expect(metrics.return1y).toBeGreaterThan(0);
    expect(metrics.volatility1y).toBeGreaterThan(0);
    expect(indexMetrics([100, 101]).return1y).toBeNull();
    const empty = assembleCrossMarket(null, [], [], false);
    expect(empty.stocks).toEqual([]);
    expect(empty.core).toEqual([]);
    expect(empty.defensive).toEqual([]);
    expect(empty.indices).toEqual([]);
  });

  it("accepts only supported periods and leaves a gap without enough stored bars", () => {
    expect(["1d", "1m", "3m", "1y"].map(parseDashboardPeriod)).toEqual(["1d", "1m", "3m", "1y"]);
    expect(parseDashboardPeriod("all")).toBe("1d");
    expect(parseDashboardPeriod(["1y"])).toBe("1d");
    expect(returnOverPeriod([100, 105], "1d")).toBeCloseTo(5);
    expect(returnOverPeriod([100, 105], "1m")).toBeNull();
    const structure = assembleCrossMarket(shortlist([stock(1, "Technology")]), [fund("F1", "bond", "Index")], [
      { code: "IDX", name: "Index", asOf: "2026-11-11", closes: [100, 101], aboveMa200: null, return1y: null, volatility1y: null },
    ], false);
    const rows = assemblePeriodRows(structure, [fund("F1", "bond", "Index")], "1m", { stocks: { S1: { asOf: "2026-11-11", closes: [100, 101] } }, funds: {} });
    expect(rows.stocks[0]).toMatchObject({ scoreDate: asOf, priceDate: "2026-11-11", returnPercent: null });
    expect(rows.funds[0]).toMatchObject({ scoreDate: "2026-11-06", priceDate: null, returnPercent: null });
    expect(rows.indices[0]).toMatchObject({ scorePercent: null, priceDate: "2026-11-11", returnPercent: null });
  });

  it("fills each sample sleeve and period from fixture data", async () => {
    const before = process.env.DATA_MODE;
    process.env.DATA_MODE = "fixture";
    try {
      const [short, data] = await Promise.all([latestShortlist(), latestCrossMarketData()]);
      const structure = assembleCrossMarket(short, data.funds, data.indices, data.sample);
      expect(structure.sample).toBe(true);
      expect(structure.stocks.length).toBeGreaterThan(0);
      expect(structure.core.length).toBeGreaterThan(0);
      expect(structure.defensive.length).toBeGreaterThan(0);
      expect(structure.indices.length).toBeGreaterThan(0);
      const prices = await latestPeriodPrices(structure.stocks.map((item) => item.ticker), data.funds.map((item) => item.vendorSymbol!).filter(Boolean));
      const month = assemblePeriodRows(structure, data.funds, "1m", prices);
      expect(month.stocks[0].returnPercent).not.toBeNull();
      expect(month.funds[0].returnPercent).not.toBeNull();
      expect(month.indices[0].returnPercent).not.toBeNull();
      expect(assemblePeriodRows(structure, data.funds, "1y", prices).stocks[0].returnPercent).toBeNull();
    } finally { process.env.DATA_MODE = before; }
  });
});
