import { describe, expect, it } from "vitest";
import { etfScore, type EtfScoreFacts } from "./etf-score";

const base: EtfScoreFacts = { asOf: "2026-11-12", instrumentType: "ETF", name: "Plain index fund", detailStatus: "ok", lastSeen: "2026-11-12", terPct: 0.1,
  aumEur: 1_000_000_000, medianValueTradedEur: 1_000_000, replication: "full physical", ucitsConfirmed: true, inceptionDate: "2020-01-01", domicile: "IE", assetClass: "equity", usEquityWeightPct: 60,
  barsCount: 252, close: 103, sma50: 102, sma200: 100, return12to1m: 0.01, maxDrawdown1y: -0.19,
  topTenWeightPct: 40, maxCountryWeightPct: 60, maxSectorWeightPct: 30, holdingsCount: 500 };
const score = (change: Partial<EtfScoreFacts> = {}) => etfScore({ ...base, ...change });
const hit = (change: Partial<EtfScoreFacts>, id: string) => score(change).rules.find((r) => r.id === id)!;

describe("ETF rule thresholds", () => {
  it.each([[0.10, 10], [0.1001, 8], [0.20, 8], [0.30, 6], [0.50, 4], [0.75, 2], [0.751, 0]])("TER %s earns %s", (terPct, earned) => expect(hit({ terPct }, "ter").earned).toBe(earned));
  it.each([[1_000_000_000, 6], [999_999_999, 5], [500_000_000, 5], [100_000_000, 3], [50_000_000, 1], [49_999_999, 0]])("AUM %s earns %s", (aumEur, earned) => expect(hit({ aumEur }, "aum").earned).toBe(earned));
  it.each([[1_000_000, 4], [999_999, 2], [100_000, 2], [99_999, 0]])("liquidity %s earns %s", (medianValueTradedEur, earned) => expect(hit({ medianValueTradedEur }, "liquidity").earned).toBe(earned));
  it.each([["full", 3], ["sampled physical", 2], ["swap", 1], ["unknown type", 0]])("replication %s earns %s", (replication, earned) => expect(hit({ replication: String(replication) }, "replication").earned).toBe(earned));
  it("leaves unqualified physical replication unevidenced", () => expect(hit({ replication: "physical" }, "replication").evidenced).toBe(false));
  it("documents the current reader ceiling without weakening the floor", () => {
    const result = score({ aumEur: null, replication: null, ucitsConfirmed: null });
    expect(result.evidencedMax).toBe(23);
    expect(result.rejections).toContain("insufficient_evidence");
    expect(score({ aumEur: null, replication: null, ucitsConfirmed: null, usEquityWeightPct: null }).evidencedMax).toBe(22);
  });
  it("counts confirmed UCITS only", () => { expect(hit({ ucitsConfirmed: true }, "ucits").earned).toBe(3); expect(hit({ ucitsConfirmed: false }, "ucits").earned).toBe(0); expect(hit({ ucitsConfirmed: null }, "ucits").evidenced).toBe(false); });
  it.each([["2025-11-12", 1], ["2023-11-12", 2], ["2021-11-12", 3]])("inception %s earns %s", (inceptionDate, earned) => expect(hit({ inceptionDate: String(inceptionDate) }, "age").earned).toBe(earned));
  it("applies the IE domicile point to US-equity exposure", () => { expect(hit({ domicile: "IE" }, "domicile").earned).toBe(1); expect(hit({ domicile: "LU" }, "domicile").earned).toBe(0); expect(hit({ assetClass: "bond", domicile: "LU" }, "domicile").earned).toBe(1); });
  it("uses the 2 percent SMA band and trend boundaries", () => { expect(hit({ close: 102 }, "sma200").earned).toBe(0); expect(hit({ close: 102.01 }, "sma200").earned).toBe(2); expect(hit({ sma50: 100 }, "sma50").earned).toBe(0); expect(hit({ return12to1m: 0 }, "return12to1m").earned).toBe(0); expect(hit({ maxDrawdown1y: -0.2 }, "drawdown1y").earned).toBe(0); });
  it("records why AUM is unevidenced", () => expect(hit({ aumEur: null, aumCurrencyReason: "ambiguous_aum_currency" }, "aum").reason).toBe("ambiguous_aum_currency"));
  it("counts complete evidence and concentration separately", () => { expect(score()).toMatchObject({ earned: 35, evidencedMax: 35, percent: 100, state: "rated" }); expect(score({ topTenWeightPct: 51 }).concentration.concentrated).toBe(true); expect(score({ maxCountryWeightPct: 71 }).concentration.concentrated).toBe(true); expect(score({ topTenWeightPct: 50, maxCountryWeightPct: 70 }).concentration.concentrated).toBe(false); });
  it("omits missing evidence and all trend with under 200 bars", () => { expect(hit({ terPct: null }, "ter").evidenced).toBe(false); const s = score({ barsCount: 199 }); expect(s.rules.filter((r) => r.group === "trend").every((r) => !r.evidenced)).toBe(true); expect(s.evidencedMax).toBe(30); });
  it("starts trend evidence at 200 bars", () => { expect(hit({ barsCount: 200 }, "sma200").evidenced).toBe(true); expect(hit({ barsCount: 199 }, "sma200").evidenced).toBe(false); });
  it("requires at least 80 percent evidenced", () => { expect(score({ replication: null, ucitsConfirmed: null, terPct: null }).rejections).toContain("insufficient_evidence"); expect(score({ replication: null, ucitsConfirmed: null, return12to1m: null }).evidencedMax).toBe(28); });
});
describe("ETF exclusions", () => {
  it.each([
    [{ name: "2x leveraged daily fund" }, "leveraged_inverse_daily_reset"], [{ name: "Inverse index fund" }, "leveraged_inverse_daily_reset"], [{ name: "Daily-reset fund" }, "leveraged_inverse_daily_reset"],
    [{ instrumentType: "ETC" }, "not_etf_instrument"], [{ instrumentType: "ETN" }, "not_etf_instrument"],
    [{ inceptionDate: "2026-01-01" }, "age_under_one_year"], [{ aumEur: 19_999_999 }, "aum_under_20m_eur"],
    [{ detailStatus: "isin_mismatch" }, "isin_mismatch"], [{ detailStatus: "not_etf" }, "not_etf"], [{ lastSeen: "2026-10-12" }, "stale_listing"],
  ] as const)("marks %o as %s", (change, reason) => { const result = score(change); expect(result.state).toBe("not_rated"); expect(result.rejections).toContain(reason); expect(result.percent).toBeNull(); });
  it("keeps the rejection boundaries inclusive", () => { expect(score({ aumEur: 20_000_000 }).rejections).not.toContain("aum_under_20m_eur"); expect(score({ inceptionDate: "2025-11-12" }).rejections).not.toContain("age_under_one_year"); expect(score({ lastSeen: "2026-10-13" }).rejections).not.toContain("stale_listing"); });
});

it.each(["ShortDAX x2", "LevDAX", "Short European equity", "Ultra index", "3x fund", "x4 fund"])("excludes leveraged or short name %s", (name) => expect(score({ name }).rejections).toContain("leveraged_inverse_daily_reset"));
it("checks explicit risk classification too", () => expect(score({ riskType: "inverse" }).rejections).toContain("leveraged_inverse_daily_reset"));

it.each(["Short term government bonds", "Ultra short duration bonds", "Ultrashort Treasury"])("does not mistake duration for an inverse strategy: %s", (name) => expect(score({ name }).rejections).not.toContain("leveraged_inverse_daily_reset"));
