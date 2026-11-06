import { describe, expect, it } from "vitest";
import { liquidityReason, loadSecProfile, nameExclusion, profileExclusion, type SecProfile } from "./discovery-quality";
import { DISCOVERY } from "./discovery-config";
import { nonCommonStockReason, preScreenMa200, profileFilter, screenDiscoveryShortlist, shortlistCandidates, type DiscoveryCandidate, type QualityCheck } from "./discovery";
import type { OHLCV } from "../engine/types";

/** Fixtures for the weak names the 2026-10-09 manual run stored (TXO, SDSYA, BDCO) and a mid-cap growth name. */
const row = (symbol: string, name: string, growth?: { current: number; prior: number }): DiscoveryCandidate => ({ symbol, name, sector: "Growth", theme: null, score: 3, sources: [], growth });
const TXO = row("TXO", "TXO Partners, L.P.");
const SDSYA = row("SDSYA", "South Dakota Soybean Processors LLC");
const BDCO = row("BDCO", "Blue Dolphin Energy Co");
const GROW = row("GRWT", "Growth Technologies Inc", { current: 40, prior: 20 });

const series = (close: number, volume: number, length = 220): OHLCV[] => Array.from({ length }, (_, i) => {
  const price = close - (length - 1 - i) * 0.1;
  return { date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: price, high: price, low: price, close: price, volume };
});

/** Same shape as the ordinary scoring test (steady uptrend, volume alternating), scaled to a liquid mid-cap. */
const growthBars: OHLCV[] = Array.from({ length: 220 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: i % 2 ? 100_000 : 200_000 }));

const profiles: Record<string, SecProfile> = {
  TXO: { name: "TXO Partners, L.P.", sic: "1311", sicDescription: "Crude Petroleum & Natural Gas", forms: ["10-K", "10-Q"], sharesOutstanding: 40_000_000 },
  SDSYA: { name: "SOUTH DAKOTA SOYBEAN PROCESSORS LLC", sic: "2070", sicDescription: "Fats & Oils", forms: ["10-K", "10-Q"], sharesOutstanding: 30_400_000 },
  BDCO: { name: "BLUE DOLPHIN ENERGY CO", sic: "2911", sicDescription: "Petroleum Refining", forms: ["10-K", "10-Q"], sharesOutstanding: 12_700_000 },
  GRWT: { name: "Growth Technologies Inc", sic: "7372", sicDescription: "Services-Prepackaged Software", forms: ["10-K", "10-Q", "8-K"], sharesOutstanding: 80_000_000 },
};

describe("name exclusions", () => {
  it("excludes the known bad names", () => {
    expect(nameExclusion("TXO", TXO.name)).toBe("limited partnership (LP or MLP)");
    expect(nameExclusion("SDSYA", SDSYA.name)).toBe("cooperative or processor-owned entity");
  });
  it.each([
    ["EPD", "Enterprise Products Partners L.P.", "limited partnership (LP or MLP)"],
    ["XYZ", "Energy Transfer LP", "limited partnership (LP or MLP)"],
    ["CHS", "CHS Cooperative", "cooperative or processor-owned entity"],
    ["GRDN", "Gardens Acquisition Corp", "SPAC (blank check company)"],
    ["FRGN", "Foreign Holdings ADR", "ADR or depositary shares"],
    ["ABCDW", "ABC Acquisition Corp Warrants", "SPAC (blank check company)"],
    ["ABCDR", "ABC Rights", "not common stock (warrant, unit, right, preferred, notes, ETF or trust)"],
    ["BHR", "Braemar Hotels Series D Preferred Stock", "not common stock (warrant, unit, right, preferred, notes, ETF or trust)"],
    ["UNIT", "Alpha Units", "not common stock (warrant, unit, right, preferred, notes, ETF or trust)"],
  ])("excludes %s %s", (symbol, name, reason) => { expect(nameExclusion(symbol, name)).toBe(reason); });
  it("passes ordinary operating companies", () => {
    for (const [symbol, name] of [["GRWT", GROW.name], ["VRT", "Vertiv Holdings Co"], ["MOD", "Modine Manufacturing Co"], ["BRK.B", "Berkshire Hathaway Inc"], ["ALP", "Alpine Summit Corp"]]) expect(nameExclusion(symbol, name)).toBeNull();
  });
  it("does not mistake the Prague exchange suffix for preferred shares", () => {
    expect(nonCommonStockReason("CEZ.PR", "PR")).toBeNull();
    expect(nonCommonStockReason("CEZ.P.PR", "PR")).toBe("preferred-share symbol");
  });
  it("is applied before the cut so lower ranks fill the shortlist", () => {
    const { shortlist, skipped } = shortlistCandidates([TXO, SDSYA, GROW], new Set(), 2);
    expect(shortlist.map((r) => r.symbol)).toEqual(["GRWT"]);
    expect(skipped.map((s) => s.symbol)).toEqual(["TXO", "SDSYA"]);
  });
});

describe("SEC profile exclusions", () => {
  it("excludes SPAC SIC, foreign filers and excluded names, and passes a domestic operating company", () => {
    expect(profileExclusion("SPAK", { name: "Plain Name Inc", sic: "6770", sicDescription: "Blank Checks", forms: ["10-K"], sharesOutstanding: 1 })).toBe("SIC 6770 Blank Checks");
    expect(profileExclusion("SHELL", { name: "Shell Holdings Ltd", sic: "3674", sicDescription: null, forms: ["20-F", "6-K"], sharesOutstanding: 1 })).toBe("foreign filer (ADR or foreign issuer)");
    expect(profileExclusion("TXO", profiles.TXO)).toBe("limited partnership (LP or MLP)");
    expect(profileExclusion("GRWT", profiles.GRWT)).toBeNull();
  });
});

describe("market cap and dollar volume floors", () => {
  it("excludes BDCO on market cap and passes a mid-cap growth name", () => {
    expect(DISCOVERY.minMarketCapUsd).toBe(300_000_000);
    expect(DISCOVERY.minAvgDollarVolumeUsd).toBe(2_000_000);
    const bdco = liquidityReason(series(4, 400_000), profiles.BDCO.sharesOutstanding);
    expect(bdco).toMatch(/^market cap \$\d+\.\d+M below \$300\.0M$/);
    expect(liquidityReason(growthBars, profiles.GRWT.sharesOutstanding)).toBeNull();
  });
  it("applies the dollar volume floor and treats missing shares as unknown", () => {
    expect(liquidityReason(series(60, 10_000), 80_000_000)).toMatch(/^average dollar volume \$\d+\.\dM below \$2\.0M$/);
    expect(liquidityReason(growthBars, null)).toBe("market cap unknown (no shares outstanding in SEC data)");
    expect(liquidityReason([], 80_000_000)).toBe("no price bars");
  });
  it("uses the explicit config values, not constants in the function", () => {
    expect(liquidityReason(growthBars, 10_000_000, { ...DISCOVERY, minMarketCapUsd: 10_000_000_000 })).toMatch(/below \$10000\.0M$/);
  });
});

describe("screening with the quality floor", () => {
  const data: Record<string, OHLCV[]> = { TXO: series(30, 300_000), SDSYA: series(10, 50_000), BDCO: series(4, 400_000), GRWT: growthBars };
  const reject: QualityCheck = (r, bars) => liquidityReason(bars, profiles[r.symbol]?.sharesOutstanding ?? null);
  const macro = { growthSectorRotation: true, dataTailwind: true };

  it("drops BDCO before the MA200 pre-screen cut and keeps the growth name", async () => {
    const result = await preScreenMa200([BDCO, GROW], "2026-08-08", async (s) => data[s], 10, reject);
    expect(result.kept.map((r) => r.symbol)).toEqual(["GRWT"]);
    expect(result.dropped).toEqual([{ symbol: "BDCO", reason: expect.stringMatching(/^pre-screen: market cap/) }]);
  });
  it("lists BDCO with a quality reason in the full screen, and passes the growth name", async () => {
    const result = await screenDiscoveryShortlist([BDCO, GROW], "2026-08-08", async (s) => data[s], macro, 500, reject);
    expect(result.notPassed).toEqual([{ symbol: "BDCO", reason: expect.stringMatching(/^quality: market cap/) }]);
    expect(result.screened.map((r) => r.symbol)).toEqual(["GRWT"]);
  });
});

describe("profileFilter", () => {
  const get = async (url: string) => {
    const cik = Number(/CIK(\d{10})/.exec(url)![1]);
    const symbol = ({ 1: "TXO", 2: "SDSYA", 3: "BDCO", 4: "GRWT" } as Record<number, string>)[cik];
    const p = profiles[symbol];
    if (url.includes("/submissions/")) return JSON.stringify({ name: p.name, sic: p.sic, sicDescription: p.sicDescription, filings: { recent: { form: p.forms } } });
    if (url.endsWith("dei/EntityCommonStockSharesOutstanding.json")) return JSON.stringify({ units: { shares: [{ end: "2025-12-31", filed: "2026-02-01", val: 1 }, { end: "2026-06-30", filed: "2026-08-01", val: p.sharesOutstanding }] } });
    throw new Error("404");
  };
  const ciks = new Map([["TXO", 1], ["SDSYA", 2], ["BDCO", 3], ["GRWT", 4]]);

  it("drops TXO and SDSYA by registered name and reads the latest share count", async () => {
    const result = await profileFilter([TXO, SDSYA, BDCO, GROW], ciks, get);
    expect(result.kept.map((r) => r.symbol)).toEqual(["BDCO", "GRWT"]);
    expect(result.excluded.map((r) => r.symbol)).toEqual(["TXO", "SDSYA"]);
    expect(result.profiles.get("GRWT")?.sharesOutstanding).toBe(80_000_000);
  });
  it("falls back to the balance sheet share count and keeps a name with no CIK with a null profile", async () => {
    const profile = await loadSecProfile(4, async (url) => {
      if (url.includes("/submissions/")) return JSON.stringify({ name: "X", filings: { recent: { form: ["10-K"] } } });
      if (url.includes("us-gaap/CommonStockSharesOutstanding")) return JSON.stringify({ units: { shares: [{ end: "2026-06-30", val: 5 }] } });
      throw new Error("404");
    });
    expect(profile.sharesOutstanding).toBe(5);
    const result = await profileFilter([row("NOCIK", "No Cik Inc")], new Map(), get);
    expect(result.kept).toHaveLength(1);
    expect(result.profiles.get("NOCIK")).toBeNull();
  });
});
