import { describe, expect, it } from "vitest";
import { etfScore, etfScoreCoverage, etfScoreStatus, normalizeReplication, type EtfScoreFacts } from "./etf-score";
import { etfBand } from "./etf-bands";

const base: EtfScoreFacts = { asOf: "2026-11-12", instrumentType: "ETF", name: "Plain index fund", detailStatus: "ok", lastSeen: "2026-11-12", terPct: 0.1,
  peerPercentile: 20, aumEur: 1_000_000_000, medianValueTradedEur: 5_000_000, medianDailyRangePct: 0.4,
  replication: "full physical", ucitsConfirmed: true, inceptionDate: "2020-01-01", domicile: "IE", assetClass: "equity", usEquityWeightPct: 60,
  trackedIndex: "S&P 500", distribution: "dist", barsCount: 756, close: 103, sma50: 102, sma200: 100, return12to1m: 0.01,
  return6m: 0.1, benchmarkReturn6m: 0.09, maxDrawdown1y: -0.19, maxDrawdown3y: -0.19, vol1yPct: 14, sharpe3y: 1,
  topTenWeightPct: 20, maxCountryWeightPct: 60, maxSectorWeightPct: 30, holdingsCount: 500, holdingsListed: 500,
  yieldPct: 1.5, dividendsLast12m: 4, statsDate: "2026-11-12", barDate: "2026-11-12" };
const score = (change: Partial<EtfScoreFacts> = {}) => etfScore({ ...base, ...change });
const hit = (change: Partial<EtfScoreFacts>, id: string) => score(change).rules.find((r) => r.id === id)!;

describe("ETF v3 thresholds", () => {
  it.each([[0.1, 12], [0.1001, 10], [0.2, 10], [0.3, 8], [0.5, 5], [0.75, 2], [0.751, 0]])("TER %s earns %s", (terPct, earned) => expect(hit({ terPct }, "ter").earned).toBe(earned));
  it.each([[25, 8], [50, 5], [75, 2], [76, 0]])("peer percentile %s earns %s", (peerPercentile, earned) => expect(hit({ peerPercentile }, "peerTer").earned).toBe(earned));
  it.each([[1_000_000_000, 8], [500_000_000, 6], [250_000_000, 4], [100_000_000, 3], [50_000_000, 1], [49_999_999, 0]])("AUM %s earns %s", (aumEur, earned) => expect(hit({ aumEur }, "aum").earned).toBe(earned));
  it.each([[5_000_000, 8], [1_000_000, 6], [250_000, 4], [100_000, 2], [99_999, 0]])("liquidity %s earns %s", (medianValueTradedEur, earned) => expect(hit({ medianValueTradedEur }, "liquidity").earned).toBe(earned));
  it.each([[0.5, 4], [1, 2], [1.01, 0]])("daily range %s earns %s", (medianDailyRangePct, earned) => expect(hit({ medianDailyRangePct }, "dailyRange").earned).toBe(earned));
  it.each([["full", 4], ["sampled physical", 3], ["fund of funds", 3], ["swap", 1]])("replication %s earns %s", (replication, earned) => expect(hit({ replication }, "replication").earned).toBe(earned));
  it("uses catalog wrapper hint with domicile fallback", () => { expect(hit({ ucitsConfirmed: true }, "ucits").earned).toBe(3); expect(hit({ ucitsConfirmed: false }, "ucits").earned).toBe(0); expect(hit({ ucitsConfirmed: null }, "ucits").earned).toBe(2); expect(hit({ ucitsConfirmed: null, domicile: "US" }, "ucits").evidenced).toBe(false); });
  it.each(["Ireland", "Irland", "Luxembourg", "Luxemburg", "Germany", "France", "Netherlands"])("uses the stored %s domicile for the wrapper fallback", (domicile) => {
    expect(hit({ ucitsConfirmed: null, domicile }, "ucits").earned).toBe(2);
  });
  it("recognizes Ireland names for the US equity domicile rule", () => {
    expect(hit({ domicile: "Ireland" }, "domicile").earned).toBe(2);
    expect(hit({ domicile: "Irland" }, "domicile").earned).toBe(2);
    expect(hit({ domicile: "Luxembourg" }, "domicile").earned).toBe(0);
  });
  it.each([["2025-11-12", 1], ["2023-11-12", 3], ["2021-11-12", 4]])("inception %s earns %s", (inceptionDate, earned) => expect(hit({ inceptionDate }, "age").earned).toBe(earned));
  it("counts the full 100 points and stores rule evidence", () => {
    const result = score(); expect(result).toMatchObject({ earned: 100, evidencedMax: 100, percent: 100, state: "rated", band: "rulesMet", incompleteData: false });
    expect(result.rules.every((r) => r.threshold && r.value !== undefined && r.date !== undefined)).toBe(true);
    expect(result.rules.filter((r) => r.group === "cost").reduce((sum, r) => sum + r.max, 0)).toBe(20);
  });
  it("excludes income for accumulating funds", () => { const result = score({ distribution: "acc" }); expect(result.rules.some((r) => r.group === "income")).toBe(false); expect(result.evidencedMax).toBe(92); });
  it("records a gap reason for ambiguous TER and missing peers", () => { expect(hit({ terPct: null, terGapReason: "ter_ambiguous" }, "ter").gapReason).toBe("ter_ambiguous"); expect(hit({ peerPercentile: null }, "peerTer").gapReason).toBe("insufficient_peers"); });
  it("requires Cost, Size, and two other eligible groups", () => {
    const thin = { medianValueTradedEur: null, medianDailyRangePct: null, replication: null, ucitsConfirmed: null, domicile: null, trackedIndex: null, topTenWeightPct: null, maxCountryWeightPct: null, maxSectorWeightPct: null, holdingsCount: null, barsCount: 0, close: null, sma50: null, sma200: null, return12to1m: null, return6m: null, benchmarkReturn6m: null, vol1yPct: null, sharpe3y: null, maxDrawdown3y: null };
    expect(score(thin).rejections).toContain("insufficient_evidence");
    expect(score({ ...thin, replication: "full" }).state).toBe("not_rated");
    expect(score({ ...thin, replication: "full", vol1yPct: 10 }).state).toBe("rated");
    expect(score({ ...thin, replication: "full", vol1yPct: 10, terPct: null }).state).toBe("not_rated");
  });
  it("caps a thin high score and marks incomplete data", () => { expect(etfBand(95, 69)).toEqual({ band: "mostlyMet", incompleteData: true }); expect(etfBand(59, 100).band).toBe("partlyMet"); expect(etfBand(47, 100).band).toBe("fewMet"); });
  it("uses bond risk thresholds", () => { expect(hit({ assetClass: "bond", vol1yPct: 8 }, "volatility1y").earned).toBe(3); expect(hit({ assetClass: "bond", maxDrawdown3y: -0.14 }, "drawdown3y").earned).toBe(2); });
  it("keeps concentration separate", () => { expect(score({ topTenWeightPct: 51 }).concentration.concentrated).toBe(true); expect(score({ maxCountryWeightPct: 71 }).concentration.concentrated).toBe(true); });
});

it.each([["Physical", "full"], ["Optimized sampling", "sampling"], ["Fund of fund", "fund_of_funds"], ["Swap/derivatives", "synthetic"], ["Options overlay", "overlay"], ["", null]] as const)("normalizes replication %s", (raw, kind) => expect(normalizeReplication(raw)).toBe(kind));
it("shows the correct band for rated funds", () => { expect(etfScoreStatus(score())).toBe("rulesMet"); expect(etfScoreStatus({ ...score(), percent: 55, evidencedMax: 100 })).toBe("partlyMet"); });
it("keeps exclusions and status priority", () => {
  expect(score({ name: "2x leveraged daily fund" }).rejections).toContain("leveraged_inverse_daily_reset");
  expect(etfScoreStatus(score({ instrumentType: "ETN" }))).toBe("outOfScope");
  expect(etfScoreStatus(score({ terPct: 1.6 }))).toBe("rejected");
  expect(etfScoreStatus(score({ close: 90 }))).toBe("trendBroken");
  expect(etfScoreStatus(score({ aumEur: 30_000_000 }))).toBe("caution");
  expect(score({ lastSeen: "2026-10-01" }).rejections).toContain("stale_listing");
});
it("counts eight evidenced groups and legacy gap labels", () => { expect(etfScoreCoverage(score().rules).groupsWithData).toBe(8); expect(etfScoreCoverage(score({ terPct: null }).rules).gaps).toContain("ter"); });
