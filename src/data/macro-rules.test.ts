import { describe, expect, it } from "vitest";
import { DEFAULT_MACRO_CONFIG, evaluateDataTailwind, evaluateSectorRotation, macroConfig, type Bar, type VixPoint, type YieldPoint } from "./macro-rules";

const ASOF = "2026-10-02"; // Friday
const dates = (n: number, last = ASOF) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${last}T00:00:00Z`) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
/** n daily points ending at `last`, linear from `first` to `end`. */
const yields = (n: number, first: number, end: number, last = ASOF): YieldPoint[] => dates(n, last).map((date, i) => ({ date, value: first + ((end - first) * i) / (n - 1) }));
const vix = (close: number, date = ASOF): VixPoint[] => [{ date, close }];
const monthly = (growth = 1) => Array.from({ length: 24 }, (_, i) => ({ date: new Date(Date.UTC(2024, 10 + i, 1)).toISOString().slice(0, 10), value: 100 + i * growth }));
const inflation = () => ({ cpi: monthly(), ppi: monthly(2) });
const bars = (n: number, first: number, end: number, last = ASOF): Bar[] => dates(n, last).map((date, i) => ({ date, close: first + ((end - first) * i) / (n - 1) }));

describe("dataTailwind", () => {
  it("is true when the yield did not rise over 20 sessions and VIX is below 25", () => {
    const result = evaluateDataTailwind(yields(30, 4.4, 4.2), vix(18.5), ASOF);
    expect(result.value).toBe(true);
    expect(result.reason).toContain("Tailwind");
    expect(result.evidenceDates).toEqual([ASOF, ASOF]);
  });
  it("counts an unchanged yield as not rising", () => {
    expect(evaluateDataTailwind(yields(30, 4.3, 4.3), vix(20), ASOF).value).toBe(true);
  });
  it("is false when the yield rose", () => {
    const result = evaluateDataTailwind(yields(30, 4.0, 4.6), vix(18), ASOF);
    expect(result.value).toBe(false);
    expect(result.reason).toContain("above 0.25");
  });
  it("is false when VIX is 25 or higher", () => {
    expect(evaluateDataTailwind(yields(30, 4.4, 4.2), vix(25), ASOF).value).toBe(false);
    expect(evaluateDataTailwind(yields(30, 4.4, 4.2), vix(31.2), ASOF).value).toBe(false);
  });
  it("measures the yield change over exactly 20 observations", () => {
    const series = yields(30, 4, 4);
    series[series.length - 1].value = 4.1; // rose on the last day only
    series[series.length - 21].value = 4.2; // 20 sessions back is higher, so the change is negative
    expect(evaluateDataTailwind(series, vix(15), ASOF).value).toBe(true);
    series[series.length - 21].value = 3.8;
    expect(evaluateDataTailwind(series, vix(15), ASOF).value).toBe(false);
  });
  it("uses only data on or before the date", () => {
    const later = yields(30, 4.0, 5.0, "2026-10-09");
    expect(evaluateDataTailwind(later, vix(15, "2026-10-09"), ASOF).value).toBeNull();
    expect(evaluateDataTailwind([...yields(30, 4.4, 4.2), ...later.slice(-3)], [...vix(15), ...vix(40, "2026-10-09")], ASOF).value).toBe(true);
  });
  it("is unknown when the yield is stale", () => {
    const result = evaluateDataTailwind(yields(30, 4.4, 4.2, "2026-09-20"), vix(18), ASOF);
    expect(result.value).toBeNull();
    expect(result.reason).toMatch(/yield is stale/);
  });
  it("is unknown when VIX is stale", () => {
    const result = evaluateDataTailwind(yields(30, 4.4, 4.2), vix(18, "2026-09-20"), ASOF);
    expect(result.value).toBeNull();
    expect(result.reason).toMatch(/VIX is stale/);
  });
  it("accepts a newest point exactly at the age limit and rejects one day more", () => {
    expect(evaluateDataTailwind(yields(30, 4.4, 4.2, "2026-09-27"), vix(18, "2026-09-27"), ASOF).value).toBe(true);
    expect(evaluateDataTailwind(yields(30, 4.4, 4.2, "2026-09-26"), vix(18), ASOF).value).toBeNull();
  });
  it("is unknown when an input is missing or the yield history is too short", () => {
    expect(evaluateDataTailwind(null, vix(18), ASOF).value).toBeNull();
    expect(evaluateDataTailwind([], vix(18), ASOF).value).toBeNull();
    expect(evaluateDataTailwind(yields(30, 4.4, 4.2), null, ASOF).value).toBeNull();
    expect(evaluateDataTailwind(yields(20, 4.4, 4.2), vix(18), ASOF).value).toBeNull();
    expect(evaluateDataTailwind(yields(21, 4.4, 4.2), vix(18), ASOF).value).toBe(true);
  });
  it("is unknown, not false, when one input is missing even if the other would fail", () => {
    expect(evaluateDataTailwind(yields(30, 4.0, 4.6), null, ASOF).value).toBeNull();
    expect(evaluateDataTailwind(null, vix(40), ASOF).value).toBeNull();
  });
  it("takes thresholds from the config", () => {
    const rising = yields(30, 4.0, 4.1);
    expect(evaluateDataTailwind(rising, vix(18), ASOF).value).toBe(true);
    expect(evaluateDataTailwind(rising, vix(18), ASOF, { ...DEFAULT_MACRO_CONFIG, yieldMaxChange: 0.5 }).value).toBe(true);
    expect(evaluateDataTailwind(yields(30, 4.4, 4.2), vix(18), ASOF, { ...DEFAULT_MACRO_CONFIG, vixMax: 15 }).value).toBe(false);
  });
  it("accepts a +0.20 pp rise and rejects +0.30 pp", () => {
    expect(evaluateDataTailwind(yields(21, 4, 4.2), vix(18), ASOF, DEFAULT_MACRO_CONFIG, inflation()).value).toBe(true);
    expect(evaluateDataTailwind(yields(21, 4, 4.3), vix(18), ASOF, DEFAULT_MACRO_CONFIG, inflation()).value).toBe(false);
  });
  it("rejects re-accelerating CPI or PPI", () => {
    const series = inflation();
    series.cpi[series.cpi.length - 1].value = 150;
    expect(evaluateDataTailwind(yields(21, 4, 4.2), vix(18), ASOF, DEFAULT_MACRO_CONFIG, series).value).toBe(false);
    const ppi = inflation();
    ppi.ppi[ppi.ppi.length - 1].value = 200;
    expect(evaluateDataTailwind(yields(21, 4, 4.2), vix(18), ASOF, DEFAULT_MACRO_CONFIG, ppi).value).toBe(false);
  });
  it("falls back when CPI is missing or monthly data is stale", () => {
    const result = evaluateDataTailwind(yields(21, 4, 4.2), vix(18), ASOF, DEFAULT_MACRO_CONFIG, { cpi: null, ppi: monthly() });
    expect(result.value).toBe(true);
    expect(result.reason).toMatch(/CPIAUCSL newest none/);
    expect(evaluateDataTailwind(yields(21, 4, 4.2), vix(18), ASOF, DEFAULT_MACRO_CONFIG, { cpi: monthly().slice(0, -3), ppi: monthly() }).value).toBe(true);
  });
  it("rejects VIX 26 and keeps a missing yield unknown with inflation present", () => {
    expect(evaluateDataTailwind(yields(21, 4, 4.2), vix(26), ASOF, DEFAULT_MACRO_CONFIG, inflation()).value).toBe(false);
    expect(evaluateDataTailwind(null, vix(18), ASOF, DEFAULT_MACRO_CONFIG, inflation()).value).toBeNull();
  });
});

describe("sectorRotationIntoGrowth", () => {
  const spy = bars(30, 100, 102);
  const universeAt = (growth: number, count = 35) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`T${i}`, bars(30, 100, 100 + growth)]));
  it("is true when the universe beats SPY by more than 2 pp", () => {
    const result = evaluateSectorRotation(universeAt(8), spy, ASOF);
    expect(result.value).toBe(true);
    expect(result.reason).toContain("Rotation");
    expect(result.evidenceDates).toEqual([ASOF]);
  });
  it("is false when the spread is not above the margin", () => {
    expect(evaluateSectorRotation(universeAt(1), spy, ASOF).value).toBe(false);
    expect(evaluateSectorRotation(universeAt(-5), spy, ASOF).value).toBe(false);
  });
  it("is false when the spread equals the margin exactly", () => {
    expect(evaluateSectorRotation({ A: bars(30, 100, 100) }, bars(30, 100, 100), ASOF, { ...DEFAULT_MACRO_CONFIG, rotationMargin: 0 }).value).toBe(false);
  });
  it("compares 20-session returns, not the whole series", () => {
    // Flat for 10 bars, then the universe climbs 10% over the last 20 sessions while SPY stays flat.
    const ramp = dates(30).map((date, i) => ({ date, close: i < 10 ? 100 : 100 + ((i - 9) * 10) / 20 }));
    expect(evaluateSectorRotation({ A: ramp }, bars(30, 100, 100), ASOF).value).toBe(true);
  });
  it("takes the margin from the config", () => {
    expect(evaluateSectorRotation(universeAt(8), spy, ASOF, { ...DEFAULT_MACRO_CONFIG, rotationMargin: 10 }).value).toBe(false);
  });
  it("is unknown when SPY is missing, short or stale", () => {
    expect(evaluateSectorRotation(universeAt(8), null, ASOF).value).toBeNull();
    expect(evaluateSectorRotation(universeAt(8), [], ASOF).value).toBeNull();
    expect(evaluateSectorRotation(universeAt(8), bars(15, 100, 102), ASOF).value).toBeNull();
    const stale = evaluateSectorRotation(universeAt(8, 35), bars(30, 100, 102, "2026-09-20"), ASOF);
    expect(stale.value).toBeNull();
    expect(stale.reason).toMatch(/stale/);
  });
  it("is unknown when too few tickers have bars on SPY's last session", () => {
    const some = { ...universeAt(8, 10), ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`M${i}`, [] as Bar[]])) };
    expect(evaluateSectorRotation(some, spy, ASOF).value).toBeNull();
    const old = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`O${i}`, bars(30, 100, 110, "2026-10-01")]));
    expect(evaluateSectorRotation(old, spy, ASOF).value).toBeNull();
    expect(evaluateSectorRotation({}, spy, ASOF).value).toBeNull();
  });
  it("tolerates a few tickers without bars", () => {
    expect(evaluateSectorRotation({ ...universeAt(8, 33), X: [] as Bar[], Y: [] as Bar[] }, spy, ASOF).value).toBe(true);
  });
});

describe("macroConfig", () => {
  it("defaults to the documented placeholders", () => {
    expect(macroConfig({})).toEqual({ windowSessions: 20, yieldMaxChange: 0.25, vixMax: 25, rotationMargin: 2, maxAgeDays: 5, inflationMaxAgeDays: 45, minCoverage: 0.8 });
  });
  it("reads the environment and refuses bad values", () => {
    expect(macroConfig({ MACRO_VIX_MAX: "30", MACRO_ROTATION_MARGIN_PP: "3.5", MACRO_YIELD_MAX_CHANGE_PP: "-0.1" })).toMatchObject({ vixMax: 30, rotationMargin: 3.5, yieldMaxChange: -0.1 });
    expect(() => macroConfig({ MACRO_VIX_MAX: "abc" })).toThrow(/Invalid macro setting/);
    expect(() => macroConfig({ MACRO_WINDOW_SESSIONS: "2" })).toThrow();
    expect(() => macroConfig({ MACRO_MIN_COVERAGE: "1.5" })).toThrow();
  });
});
