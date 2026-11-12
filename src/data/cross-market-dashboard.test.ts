import { describe, expect, it } from "vitest";
import type { ShortlistData } from "@/data/shortlist";
import { latestShortlist } from "@/data/shortlist";
import type { ShortlistRow } from "@/engine/shortlist";
import type { SectorGroup } from "@/universe/sector-groups";
import { assembleCrossMarket, assemblePeriodRows, indexMetrics, latestCrossMarketData, latestPeriodPrices, parseDashboardPeriod, periodReturn, FUNDS_SQL, BROAD_REGIONS, selectDashboardFunds, selectDashboardStocks, type DashboardFund } from "./cross-market-dashboard";

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
  it("keeps shortlist names without failed F1 or F2 checks, at most three per sector and fifteen overall", () => {
    const rows = [stock(0, "Technology", false), ...Array.from({ length: 24 }, (_, index) => stock(index + 1, sectors[Math.floor(index / 4) % sectors.length]))];
    const result = selectDashboardStocks(shortlist(rows));
    expect(result.stocks).toHaveLength(15);
    expect(result.stocks).toContainEqual(expect.objectContaining({ ticker: "S0" }));
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
    expect(BROAD_REGIONS).toContain("north america");
    expect(BROAD_REGIONS).toContain("international");
    expect(BROAD_REGIONS).toContain("developed markets excluding united states and canada");
    expect(selectDashboardFunds([fund("world", "equity", "World index", 90, "All World"), fund("developed", "equity", "Developed index", 89, "Developed Markets")]).core.map((item) => item.key)).toEqual(["world", "developed"]);
  });

  it("selects core and defensive candidates independently of the overall score cap", () => {
    expect(FUNDS_SQL).toMatch(/overall AS[\s\S]*LIMIT 100[\s\S]*core AS[\s\S]*LIMIT 25[\s\S]*defensive AS[\s\S]*LIMIT 25/);
    expect(FUNDS_SQL).toMatch(/DISTINCT ON \(lower\(trim\(tracked_index\)\)\)/);
    const crowded = Array.from({ length: 120 }, (_, index) => fund(`thematic${index}`, "equity", `Theme ${index}`, 100, "Europe"));
    const selected = selectDashboardFunds([...crowded, fund("core", "equity", "World", 70), fund("bond", "bond", "Aggregate", 60)]);
    expect(selected.core.map((item) => item.key)).toEqual(["core"]);
    expect(selected.defensive.map((item) => item.key)).toEqual(["bond"]);
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

  it("uses calendar offsets, flags stale daily data, and shows missing bars as gaps", () => {
    expect(["1d", "1m", "3m", "1y"].map(parseDashboardPeriod)).toEqual(["1d", "1m", "3m", "1y"]);
    expect(parseDashboardPeriod("all")).toBe("1d");
    const dates = ["2025-11-10", "2026-08-10", "2026-09-10", "2026-10-10", "2026-11-09", "2026-11-10"];
    const closes = [50, 60, 70, 80, 100, 105];
    expect(periodReturn({ dates, closes }, "1d", "2026-11-12").value).toBeCloseTo(5);
    expect(periodReturn({ dates, closes }, "1d", "2026-11-16")).toEqual({ value: null, status: "stale" });
    expect(periodReturn({ dates, closes }, "1m").status).toBe("gap");
    const dailyDates = Array.from({ length: 366 }, (_, day) => new Date(Date.UTC(2025, 10, 10 + day)).toISOString().slice(0, 10));
    const dailyCloses = dailyDates.map((_, day) => 100 + day);
    expect(periodReturn({ dates: dailyDates, closes: dailyCloses }, "1m").value).toBeCloseTo((465 / 434 - 1) * 100);
    expect(periodReturn({ dates: dailyDates, closes: dailyCloses }, "1y").value).toBeCloseTo(365);
    const gapDates = dailyDates.filter((day) => day < "2026-10-01" || day > "2026-10-15");
    expect(periodReturn({ dates: gapDates, closes: gapDates.map((_, day) => 100 + day) }, "1m")).toEqual({ value: null, status: "gap" });
    const structure = assembleCrossMarket(shortlist([stock(1, "Technology")]), [fund("F1", "bond", "Index")], [
      { code: "IDX", name: "Index", asOf: "2026-11-10", dates: dailyDates, closes: dailyCloses, aboveMa200: null, return1y: null, volatility1y: null },
    ], false);
    const rows = assemblePeriodRows(structure, [fund("F1", "bond", "Index")], "1m", { stocks: { S1: { asOf: "2026-11-10", dates: dailyDates, closes: dailyCloses } }, funds: {} });
    expect(rows.stocks[0]).toMatchObject({ scoreDate: asOf, priceDate: "2026-11-10", priceStatus: null });
    expect(rows.funds[0]).toMatchObject({ scoreDate: "2026-11-06", priceDate: null, priceStatus: "insufficient" });
    expect(rows.indices[0]).toMatchObject({ scorePercent: null, priceDate: "2026-11-10", priceStatus: null });
  });

  it("deduplicates period ETFs and excludes volatility indices", () => {
    const funds = [fund("a", "equity", "S&P 500", 95), fund("b", "equity", "s&p 500", 94), fund("c", "bond", "Aggregate", 90)];
    const structure = assembleCrossMarket(null, funds, [{ code: "VIX", name: "Volatility Index", asOf, dates: [], closes: [], aboveMa200: null, return1y: null, volatility1y: null }], false);
    expect(structure.indices).toEqual([]);
    expect(assemblePeriodRows(structure, funds, "1m", { stocks: {}, funds: {} }).funds.map((row) => row.code)).toEqual(["a", "c"]);
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
