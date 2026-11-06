import { describe, expect, it } from "vitest";
import { barMetrics, excludedCsv, failedCriterion, filerType, isCommonStock, reviewMarkdown, revenueGrowth, selectedCsv, selectUniverse, sha256, UNIVERSE_CRITERIA, type Candidate } from "./select";
import marketRows from "./fixtures/market-candidates.json";
import golden from "./fixtures/us-golden-expected.json";
import { GOLDEN_INPUTS } from "./fixtures/us-golden";
import { fxConversion, type FxObservation } from "./market";

/** Same base row as before the market-aware model: no exchange, currency or market cap. */
const base = (ticker: string, over: Partial<Candidate> = {}): Candidate => ({
  ticker, name: `${ticker} Corp`, sector: "Tech", cik: 1, forms: ["10-Q"], core: false, revenueQuarters: 8, yoyGrowthPct: 20,
  lastClose: 50, avgDollarVolume50: 50_000_000, barDays: 50, ...over,
});

describe("US selection is unchanged for pre-market-universe inputs", () => {
  for (const [name, expected] of Object.entries(golden.cases)) {
    it(`matches origin/main output for ${name}`, () => {
      const s = selectUniverse(GOLDEN_INPUTS[name](), expected.overrides);
      expect(s.selected.map((r) => [r.rank, r.ticker, r.list, r.group, r.notes.join("; ")])).toEqual(expected.selected);
      expect(s.excluded.map((e) => [e.ticker, e.reason])).toEqual(expected.excluded);
    });
  }
  it("keeps the strict D35 code pattern for US listings and the looser one for European codes", () => {
    for (const ticker of ["BAC-PL", "XYZ.WS", "XYZ.U", "ABCW.R", "TOOLONG", "A1B"]) {
      expect(isCommonStock({ ticker, name: `${ticker} Corp` })).toBe(false);
      expect(isCommonStock({ ticker: `${ticker}.US`, name: `${ticker} Corp`, exchange: "US" })).toBe(false);
    }
    expect(isCommonStock({ ticker: "BRK.B", name: "Berkshire", exchange: "US" })).toBe(true);
    expect(isCommonStock({ ticker: "ABC.US", name: "ABC Inc", exchange: "US", vendorSymbol: "ABC.US", securityType: "Common Stock" })).toBe(true);
    expect(isCommonStock({ ticker: "1COV.XETRA", name: "Covestro AG", exchange: "XETRA", vendorSymbol: "1COV.XETRA", securityType: "Common Stock" })).toBe(true);
    expect(isCommonStock({ ticker: "BP-B.LSE", name: "BP Preferred", exchange: "LSE", vendorSymbol: "BP-B.LSE", securityType: "Common Stock" })).toBe(false);
  });
  it("applies the market-cap floor to a US name only when a dated cap exists", () => {
    expect(failedCriterion(base("NOCAP"), UNIVERSE_CRITERIA)).toBeNull();
    expect(failedCriterion(base("SMALL", { marketCapUsd: 100_000_000 }), UNIVERSE_CRITERIA)).toBe("market_cap_below_floor");
    expect(failedCriterion(base("SAP.XETRA", { exchange: "XETRA", currency: "EUR", usdPerUnit: 1.16 }), UNIVERSE_CRITERIA)).toBe("market_cap_unknown");
  });
});

describe("exchange-aware selection", () => {
  it("keeps US and European listings and separate ticker collisions", () => {
    const result = selectUniverse(marketRows as Candidate[], { target: 20, sectorCapPct: 100 });
    expect(result.selected.map((row) => row.ticker).sort()).toEqual(marketRows.filter((row) => row.ticker !== "VOD.LSE").map((row) => row.ticker).sort());
    expect(result.excluded).toContainEqual(expect.objectContaining({ ticker: "VOD.LSE", reason: "price_below_min" }));
    expect(result.selected.find((row) => row.ticker === "SAP.XETRA")?.exchange).toBe("XETRA");
    expect(result.selected.filter((row) => row.ticker.startsWith("ABC."))).toHaveLength(2);
  });
  it("keeps AI (US) and AI.PA apart and applies the SEC filer gate to the US listing only", () => {
    const rows = marketRows as Candidate[];
    const ai = rows.find((row) => row.ticker === "AI")!, airLiquide = rows.find((row) => row.ticker === "AI.PA")!;
    expect(selectUniverse([ai, airLiquide], { target: 36, sectorCapPct: 100 }).selected.map((row) => [row.ticker, row.exchange])).toEqual([["AI", "US"], ["AI.PA", "PA"]]);
    const foreign = selectUniverse([{ ...ai, forms: ["20-F"] }, airLiquide], { target: 36, sectorCapPct: 100 });
    expect(foreign.selected.map((row) => row.ticker)).toEqual(["AI.PA"]);
    expect(foreign.excluded).toContainEqual(expect.objectContaining({ ticker: "AI", reason: "foreign_filer" }));
    expect(selectUniverse([{ ...ai, forms: [] }], { target: 36 }).excluded[0].reason).toBe("filer_unknown");
  });
  it("converts price, liquidity and market cap into USD and fails closed without FX", () => {
    const rows = marketRows as Candidate[];
    const failed = selectUniverse([rows[0], { ...rows[0], ticker: "LOW.XETRA", avgDollarVolume50: 8_000_000 },
      { ...rows[2], ticker: "NOFX.SW", usdPerUnit: null }, { ...rows[1], ticker: "SMALL.AS", marketCapUsd: 100_000_000 },
      { ...rows[2], ticker: "OLD.SW", usdPerUnit: null, fxIssue: "fx_stale" }, { ...rows[0], ticker: "BLANK.XETRA", usdPerUnit: undefined, currency: "" }],
    { target: 20, sectorCapPct: 100 });
    expect(failed.excluded.map((row) => [row.ticker, row.reason])).toEqual([
      ["BLANK.XETRA", "fx_unavailable"], ["LOW.XETRA", "volume_below_floor"], ["NOFX.SW", "fx_unavailable"], ["OLD.SW", "fx_stale"], ["SMALL.AS", "market_cap_below_floor"],
    ]);
  });
  it("can set the traded-value floor per exchange without changing the default", () => {
    const sap = (marketRows as Candidate[])[0];
    const low = { ...sap, ticker: "LOW.XETRA", avgDollarVolume50: 5_000_000 };
    expect(failedCriterion(low, UNIVERSE_CRITERIA)).toBe("volume_below_floor");
    expect(failedCriterion(low, { ...UNIVERSE_CRITERIA, minAvgDollarVolumeUsdByExchange: { XETRA: 5_000_000 } })).toBeNull();
    expect(failedCriterion(base("LOWV", { avgDollarVolume50: 9_000_000 }), { ...UNIVERSE_CRITERIA, minAvgDollarVolumeUsdByExchange: { XETRA: 1 } })).toBe("volume_below_floor");
  });
  it("accepts three half-years or four quarters of revenue history", () => {
    const sap = (marketRows as Candidate[])[0];
    expect(failedCriterion({ ...sap, revenueQuarters: 3, revenuePeriod: "half" }, UNIVERSE_CRITERIA)).toBeNull();
    expect(failedCriterion({ ...sap, revenueQuarters: 2, revenuePeriod: "half" }, UNIVERSE_CRITERIA)).toBe("short_revenue_history");
    expect(failedCriterion({ ...sap, revenueQuarters: 3 }, UNIVERSE_CRITERIA)).toBe("short_revenue_history");
  });
  it("fails closed on loader listing issues", () => {
    const vod = (marketRows as Candidate[]).find((row) => row.ticker === "VOD.LSE")!;
    expect(failedCriterion({ ...vod, listingIssue: "currency_unverified_gbx" }, UNIVERSE_CRITERIA)).toBe("currency_unverified_gbx");
    expect(failedCriterion({ ...vod, listingIssue: "listing_not_synced" }, UNIVERSE_CRITERIA)).toBe("listing_not_synced");
  });
});

describe("ECB conversion", () => {
  const asOf = "2026-10-21";
  const rates = (entries: [string, number, string][]) => new Map<string, FxObservation>(entries.map(([id, value, date]) => [id, { value, date }]));
  it("converts EUR, GBP pence and crosses from rates of the same day", () => {
    const fresh = rates([["ECB_EURUSD", 1.16, "2026-10-20"], ["ECB_EURGBP", 0.87, "2026-10-20"], ["ECB_EURCHF", 0.93, "2026-10-20"]]);
    expect(fxConversion("USD", new Map(), asOf)).toEqual({ usdPerUnit: 1, reason: null });
    expect(fxConversion("EUR", fresh, asOf).usdPerUnit).toBe(1.16);
    expect(fxConversion("GBX", fresh, asOf).usdPerUnit).toBeCloseTo(1.16 / 0.87 / 100);
    expect(fxConversion("CHF", new Map(), asOf)).toEqual({ usdPerUnit: null, reason: "fx_unavailable" });
    expect(fxConversion("", fresh, asOf)).toEqual({ usdPerUnit: null, reason: "fx_unavailable" });
  });
  it("rejects a series older than five days and a cross rate from two dates", () => {
    expect(fxConversion("EUR", rates([["ECB_EURUSD", 1.16, "2026-10-16"]]), asOf).reason).toBeNull();
    expect(fxConversion("EUR", rates([["ECB_EURUSD", 1.16, "2026-10-15"]]), asOf)).toEqual({ usdPerUnit: null, reason: "fx_stale" });
    expect(fxConversion("GBP", rates([["ECB_EURUSD", 1.16, "2026-10-20"], ["ECB_EURGBP", 0.87, "2026-10-19"]]), asOf)).toEqual({ usdPerUnit: null, reason: "fx_stale" });
    expect(fxConversion("GBP", rates([["ECB_EURUSD", 1.16, "2026-10-20"], ["ECB_EURGBP", 0.87, "2026-09-01"]]), asOf).reason).toBe("fx_stale");
  });
});

function fixture(): Candidate[] {
  const sectors = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rows: Candidate[] = [];
  for (let i = 1; i <= 36; i++) rows.push(base(`C${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, { core: true, sector: sectors[i % 8], yoyGrowthPct: i === 1 ? -5 : 10 }));
  for (let i = 0; i < 100; i++) rows.push(base(`G${String(i).padStart(3, "0")}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]), { sector: sectors[i % 8], yoyGrowthPct: 20 + i }));
  for (let i = 0; i < 40; i++) rows.push(base(`L${String(i).padStart(2, "0")}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]), { sector: sectors[i % 8], yoyGrowthPct: 1 + i / 10 }));
  for (let i = 0; i < 60; i++) rows.push(base(`X${String(i).padStart(2, "0")}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]), { sector: "Crypto", yoyGrowthPct: 300 + i }));
  rows.push(base("LOWP", { lastClose: 5 }), base("LOWV", { avgDollarVolume50: 10_000_000 }), base("FORE", { forms: ["20-F", "6-K"] }),
    base("WARR", { name: "Foo Warrants" }), base("NEG", { yoyGrowthPct: -1 }), base("SHORT", { revenueQuarters: 3 }));
  return rows;
}

describe("universe selection", () => {
  it("picks exactly 150 names, keeps core, honours the sector cap", () => {
    const s = selectUniverse(fixture());
    expect(s.selected).toHaveLength(150);
    expect(s.selected.filter((r) => r.list === "core")).toHaveLength(36);
    expect(s.selected.find((r) => r.group === "core" && r.notes.length)?.notes[0]).toContain("growth_not_positive");
    expect(s.sectorCap).toBe(37);
    expect(s.selected.filter((r) => r.sector === "Crypto").length).toBe(37);
    expect(s.excluded.filter((e) => e.reason === "sector_cap")).toHaveLength(23);
    // growth names fill first, so every other-growth name above 15% is in; slots left go to the best of the rest
    const growth = s.selected.filter((r) => r.group === "growth");
    expect(growth.length).toBe(150 - 36 - s.selected.filter((r) => r.group === "other").length);
    expect(s.selected.filter((r) => r.group === "other").length).toBe(0);
  });
  it("gives each exclusion a reason code", () => {
    const s = selectUniverse(fixture());
    const reason = (t: string) => s.excluded.find((e) => e.ticker === t)?.reason;
    expect([reason("LOWP"), reason("LOWV"), reason("FORE"), reason("WARR"), reason("NEG"), reason("SHORT")])
      .toEqual(["price_below_min", "volume_below_floor", "foreign_filer", "not_common_stock", "growth_not_positive", "short_revenue_history"]);
    expect(s.excluded.every((e) => e.reason)).toBe(true);
    expect(s.selected.length + s.excluded.length).toBe(fixture().length);
  });
  it("ranks growth above 15 percent first, then the rest by growth", () => {
    const s = selectUniverse([base("AAA", { yoyGrowthPct: 10 }), base("BBB", { yoyGrowthPct: 16 }), base("CCC", { yoyGrowthPct: 40 }), base("DDD", { yoyGrowthPct: 5 })], { target: 3, sectorCapPct: 100 });
    expect(s.selected.map((r) => r.ticker)).toEqual(["CCC", "BBB", "AAA"]);
    expect(s.excluded).toEqual([{ ticker: "DDD", name: "DDD Corp", sector: "Tech", reason: "below_cut" }]);
  });
  it("is deterministic and independent of input order", () => {
    const a = selectUniverse(fixture()), b = selectUniverse([...fixture()].reverse());
    expect(sha256(selectedCsv(a))).toBe(sha256(selectedCsv(b)));
    expect(sha256(excludedCsv(a))).toBe(sha256(excludedCsv(b)));
    expect(reviewMarkdown(a, "2026-11-16", { selected: "x", excluded: "y" })).toContain("selected 150: 36 core, 114 proposed adds");
  });
  it("derives filer type, growth and bar metrics", () => {
    expect(filerType(["8-K"])).toBe("domestic");
    expect(filerType(["6-K"])).toBe("foreign");
    expect(filerType([])).toBe("unknown");
    expect(revenueGrowth([{ periodEnd: "2025-09-30", value: 100 }, { periodEnd: "2025-12-31", value: 100 }, { periodEnd: "2026-03-31", value: 100 }, { periodEnd: "2026-06-30", value: 100 }, { periodEnd: "2026-09-30", value: 130 }]))
      .toEqual({ quarters: 5, yoyGrowthPct: 30 });
    expect(revenueGrowth([{ periodEnd: "2026-09-30", value: 5 }]).yoyGrowthPct).toBeNull();
    const bars = Array.from({ length: 60 }, (_, i) => ({ close: 10, volume: i < 10 ? 1 : 1000 }));
    expect(barMetrics(bars)).toEqual({ lastClose: 10, avgDollarVolume50: 10_000, barDays: 50 });
  });
});

describe("sector cap and duplicate filers", () => {
  it("never caps Unclassified, and still caps a named sector", () => {
    const rows = [...Array.from({ length: 6 }, (_, i) => base(`U${"ABCDEF"[i]}`, { sector: "Unclassified", yoyGrowthPct: 90 - i })), ...Array.from({ length: 6 }, (_, i) => base(`S${"ABCDEF"[i]}`, { sector: "Biotech", yoyGrowthPct: 50 - i }))];
    const s = selectUniverse(rows, { target: 10, sectorCapPct: 30 });
    expect(s.sectorCap).toBe(3);
    expect(s.selected.filter((r) => r.sector === "Unclassified")).toHaveLength(6);
    expect(s.selected.filter((r) => r.sector === "Biotech")).toHaveLength(3);
    expect(s.excluded.map((e) => e.reason)).toEqual(["sector_cap", "sector_cap", "sector_cap"]);
  });
  it("excludes SUNC as duplicate_filer and keeps SUN", () => {
    const s = selectUniverse([base("SUN"), base("SUNC")]);
    expect(s.selected.map((r) => r.ticker)).toEqual(["SUN"]);
    expect(s.excluded).toEqual([{ ticker: "SUNC", name: "SUNC Corp", sector: "Tech", reason: "duplicate_filer" }]);
  });
  it("keeps a core name even when it is on the duplicate list", () => {
    expect(selectUniverse([base("SUNC", { core: true })]).selected[0]).toMatchObject({ ticker: "SUNC", list: "core" });
  });
});
