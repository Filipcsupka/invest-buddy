import { describe, expect, it } from "vitest";
import {
  bandFor,
  breadthPoints,
  cleanBars,
  distributionPoints,
  drawdownFromHigh,
  earningsPoints,
  INDEX_RATING_BASIS_TEXT,
  INDEX_RATING_VERSION,
  INDEX_RATING_WEIGHTS,
  percentileBelow,
  rateIndex,
  realizedVol,
  sma,
  trendPoints,
  volatilityPoints,
  volatilityRegimeLabel,
  type IndexRatingFactorId,
  type IndexRatingInputs,
} from "./index-rating";

const START = Date.UTC(2023, 0, 2);
const day = (i: number) => new Date(START + i * 86_400_000).toISOString().slice(0, 10);

/** Daily closes with a log drift and an alternating swing whose size moves linearly from ampStart to ampEnd. */
function series(n: number, drift: number, ampStart: number, ampEnd: number) {
  return Array.from({ length: n }, (_, t) => {
    const amp = ampStart + ((ampEnd - ampStart) * t) / Math.max(1, n - 1);
    return { date: day(t), close: 100 * Math.exp(drift * t + amp * (t % 2 === 0 ? 1 : -1)) };
  });
}

const N = 800;
const calmUptrend = series(N, 0.001, 0.004, 0.0002);
const stormyDowntrend = series(N, -0.002, 0.001, 0.02);
const asOf = day(N - 1);

const full = { coveragePct: 90 };
const strongMembers = {
  breadth: { aboveMa50Pct: 85, aboveMa200Pct: 90, ...full },
  earnings: { positiveGrowthPct: 85, acceleratingPct: 80, ...full },
  scoreDistribution: { setupMetPct: 25, criteriaBrokenPct: 0, ...full },
};
const weakMembers = {
  breadth: { aboveMa50Pct: 10, aboveMa200Pct: 20, ...full },
  earnings: { positiveGrowthPct: 0, acceleratingPct: 0, ...full },
  scoreDistribution: { setupMetPct: 0, criteriaBrokenPct: 60, ...full },
};

function inputs(change: Partial<IndexRatingInputs> = {}): IndexRatingInputs {
  return { symbol: "GSPC.INDX", asOf, bars: calmUptrend, isVolatilityIndex: false, ...change };
}
const factor = (r: ReturnType<typeof rateIndex>, id: IndexRatingFactorId) => r.factors.find((f) => f.id === id)!;

describe("pure helpers", () => {
  it("computes simple moving averages with an offset", () => {
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(sma([1, 2, 3, 4, 5], 2, 2)).toBe(2.5);
    expect(sma([1, 2], 3)).toBeNull();
  });
  it("computes annualized realized volatility from log returns", () => {
    expect(realizedVol([100, 100, 100], 2)).toBe(0);
    const closes = [100, 110, 100, 110];
    const r = Math.log(1.1);
    const sd = Math.sqrt(((r - r / 3) ** 2 * 2 + (-r - r / 3) ** 2) / 2);
    expect(realizedVol(closes, 3)).toBeCloseTo(sd * Math.sqrt(252), 10);
    expect(realizedVol([100, 101], 2)).toBeNull();
  });
  it("measures drawdown from the window high", () => {
    expect(drawdownFromHigh([100, 120, 90])).toBeCloseTo(0.25, 10);
    expect(drawdownFromHigh([200, 100, 90], 2)).toBeCloseTo(0.1, 10);
    expect(drawdownFromHigh([])).toBeNull();
  });
  it("ranks a value against history", () => {
    expect(percentileBelow(3, [1, 2, 3, 4])).toBe(0.5);
    expect(percentileBelow(0, [1, 2])).toBe(0);
    expect(percentileBelow(1, [])).toBeNull();
  });
  it("cleans bars to a sorted point-in-time series", () => {
    const bars = [
      { date: "2026-01-03", close: 3 },
      { date: "2026-01-01", close: 1 },
      { date: "2026-01-02", close: 0 },
      { date: "2026-01-02", close: Number.NaN },
      { date: "2026-01-01", close: 1.5 },
      { date: "2026-01-04", close: 4 },
      { date: "bad", close: 5 },
    ];
    expect(cleanBars(bars, "2026-01-03")).toEqual([{ date: "2026-01-01", close: 1.5 }, { date: "2026-01-03", close: 3 }]);
  });
});

describe("factor rules", () => {
  it("weights add to 100", () => expect(Object.values(INDEX_RATING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100));
  it.each([
    [{ close: 110, ma50: 105, ma200: 100, ma50Slope: 1 }, 25, 4],
    [{ close: 110, ma50: 105, ma200: 100, ma50Slope: 0 }, 18, 3],
    [{ close: 102, ma50: 105, ma200: 104, ma50Slope: -1 }, 6, 1],
    [{ close: 101, ma50: 100, ma200: 105, ma50Slope: -1 }, 6, 1],
    [{ close: 104, ma50: 100, ma200: 105, ma50Slope: -1 }, 6, 1],
    [{ close: 106, ma50: 107, ma200: 105, ma50Slope: -1 }, 12, 2],
    [{ close: 90, ma50: 100, ma200: 105, ma50Slope: -1 }, 0, 0],
  ])("trend %o earns %s", (t, points, met) => expect(trendPoints(t)).toEqual({ points, met }));
  it.each([
    [20, 20, 0],
    [80, 80, 20],
    [50, 50, 10],
    [10, 95, 10],
  ])("breadth %s/%s earns %s", (a, b, p) => expect(breadthPoints(a, b)).toBeCloseTo(p, 10));
  it.each([
    [0, 0, 0],
    [50, 50, 7.5],
    [80, 80, 15],
    [65, 0, 7.5],
    [25, 100, 7.5],
  ])("earnings %s/%s earns %s", (a, b, p) => expect(earningsPoints(a, b)).toBeCloseTo(p, 10));
  it.each([
    [0, 0.0, 15],
    [1, 0.049, 5],
    [0.5, 0.05, 8],
    [0.5, 0.1, 8],
    [0.5, 0.1001, 5],
  ])("volatility percentile %s drawdown %s earns %s", (pct, dd, p) => {
    const { volPts, drawdownPts } = volatilityPoints(pct, dd);
    expect(volPts + drawdownPts).toBeCloseTo(p, 10);
  });
  it.each([
    [0, 0, 5],
    [20, 0, 10],
    [40, 0, 10],
    [0, 50, 0],
    [10, 25, 5],
    [20, 50, 5],
  ])("distribution setup %s broken %s earns %s", (s, b, p) => expect(distributionPoints(s, b)).toBeCloseTo(p, 10));
  it.each([
    [0, "low"],
    [24.99, "low"],
    [25, "normal"],
    [74.99, "normal"],
    [75, "elevated"],
    [90, "high"],
    [100, "high"],
  ])("volatility percentile %s is %s", (p, label) => expect(volatilityRegimeLabel(p)).toBe(label));
  it.each([
    [100, "broad-strength"],
    [80, "broad-strength"],
    [79, "constructive"],
    [65, "constructive"],
    [64, "mixed"],
    [45, "mixed"],
    [44, "weakening"],
    [25, "weakening"],
    [24, "broad-weakness"],
    [0, "broad-weakness"],
  ])("score %s is %s", (score, band) => expect(bandFor(score)).toBe(band));
});

describe("bar-derived factors on synthetic series", () => {
  it("scores a calm uptrend at full trend and volatility points", () => {
    const r = rateIndex(inputs());
    const trend = factor(r, "trend");
    expect(trend).toMatchObject({ assessed: true, points: 25, value: 4, date: asOf, notes: [] });
    expect(trend.inputs.ma50Slope).toBeGreaterThan(0);
    const vol = factor(r, "volatility");
    expect(vol.assessed).toBe(true);
    expect(vol.inputs.volPercentile).toBe(0);
    expect(vol.inputs.historySessions).toBe(756);
    expect(vol.inputs.drawdownPct).toBeLessThan(5);
    expect(vol.points).toBe(15);
  });
  it("scores a stormy downtrend near zero", () => {
    const r = rateIndex(inputs({ bars: stormyDowntrend }));
    expect(factor(r, "trend").points).toBe(0);
    const vol = factor(r, "volatility");
    expect(vol.inputs.drawdownPct).toBeGreaterThan(10);
    expect(vol.inputs.volPercentile).toBeGreaterThan(99);
    expect(vol.points).toBeLessThan(0.1);
  });
});

describe("composite bands", () => {
  // Assessed weight 85 (all but valuation). Calm uptrend gives 40 of 85 from bars.
  it("rates broad strength", () => {
    const r = rateIndex(inputs(strongMembers));
    expect(r).toMatchObject({ status: "rated", basis: "full", score: 100, band: "broad-strength", coveragePct: 85, assessedWeight: 85, suppressedBy: [] });
  });
  it("rates constructive", () => {
    // 40 + breadth 20 + earnings 0 + distribution 0 = 60 / 85 -> 71
    const r = rateIndex(inputs({ ...weakMembers, breadth: strongMembers.breadth }));
    expect(r.score).toBe(71);
    expect(r.band).toBe("constructive");
  });
  it("rates mixed", () => {
    // 40 + 0 + 0 + 0 = 40 / 85 -> 47
    const r = rateIndex(inputs(weakMembers));
    expect(r.score).toBe(47);
    expect(r.band).toBe("mixed");
  });
  it("rates weakening", () => {
    // ~0 + 20 + 15 + 0 = 35 / 85 -> 41
    const r = rateIndex(inputs({ ...strongMembers, bars: stormyDowntrend, scoreDistribution: weakMembers.scoreDistribution }));
    expect(r.score).toBe(41);
    expect(r.band).toBe("weakening");
  });
  it("rates broad weakness", () => {
    const r = rateIndex(inputs({ ...weakMembers, bars: stormyDowntrend }));
    expect(r.score).toBe(0);
    expect(r.band).toBe("broad-weakness");
  });
  it("is deterministic and ignores bar order", () => {
    const shuffled = [...calmUptrend].reverse();
    expect(rateIndex(inputs({ ...strongMembers, bars: shuffled }))).toEqual(rateIndex(inputs(strongMembers)));
  });
  it("reports version, coverage, members matched and per-factor evidence", () => {
    const r = rateIndex(inputs({ ...strongMembers, components: { matched: 185, total: 503 } }));
    expect(r.version).toBe(INDEX_RATING_VERSION);
    expect(r.componentsMatchedPct).toBe(36.78);
    expect(r.earned).toBe(85);
    for (const f of r.factors) {
      expect(f.max).toBe(INDEX_RATING_WEIGHTS[f.id]);
      expect(f.threshold.length).toBeGreaterThan(0);
    }
    expect(factor(r, "breadth")).toMatchObject({ points: 20, value: 87.5, date: asOf, inputs: { aboveMa50Pct: 85, aboveMa200Pct: 90, coveragePct: 90 } });
  });
});

describe("not assessed paths", () => {
  it("always leaves valuation not assessed", () => {
    const f = factor(rateIndex(inputs({ ...strongMembers, valuation: null })), "valuation");
    expect(f).toMatchObject({ assessed: false, points: null, value: null, notes: ["no-valuation-history"] });
  });
  it.each(["breadth", "earnings", "scoreDistribution"] as const)("marks missing %s as no data", (key) => {
    const id = key === "scoreDistribution" ? "distribution" : key;
    const r = rateIndex(inputs({ ...strongMembers, [key]: undefined }));
    expect(factor(r, id)).toMatchObject({ assessed: false, points: null, notes: ["no-data"] });
  });
  it.each(["breadth", "earnings", "scoreDistribution"] as const)("needs 70%% member coverage for %s", (key) => {
    const id = key === "scoreDistribution" ? "distribution" : key;
    const low = rateIndex(inputs({ ...strongMembers, [key]: { ...strongMembers[key], coveragePct: 69.9 } }));
    expect(factor(low, id)).toMatchObject({ assessed: false, notes: ["coverage-below-minimum"] });
    const ok = rateIndex(inputs({ ...strongMembers, [key]: { ...strongMembers[key], coveragePct: 70 } }));
    expect(factor(ok, id).assessed).toBe(true);
  });
  it.each([Number.NaN, -1, 101])("rejects out-of-range percent %s", (bad) => {
    const r = rateIndex(inputs({ ...strongMembers, breadth: { aboveMa50Pct: bad, aboveMa200Pct: 50, coveragePct: 90 } }));
    expect(factor(r, "breadth")).toMatchObject({ assessed: false, notes: ["invalid-data"], inputs: { aboveMa50Pct: null } });
  });
  it("leaves trend and volatility not assessed without bars", () => {
    const r = rateIndex(inputs({ ...strongMembers, bars: [] }));
    expect(factor(r, "trend").notes).toEqual(["no-bars"]);
    expect(factor(r, "volatility").notes).toEqual(["no-bars"]);
    expect(r).toMatchObject({ status: "not-enough-data", score: null, band: null, basis: null });
    expect(r.suppressedBy).toEqual(["trend-not-assessed", "volatility-not-assessed"]);
  });
  it("leaves bar factors not assessed when the last bar is stale", () => {
    const r = rateIndex(inputs({ asOf: day(N - 1 + 8) }));
    expect(factor(r, "trend").notes).toEqual(["stale-bars"]);
    expect(factor(r, "volatility").notes).toEqual(["stale-bars"]);
    expect(factor(rateIndex(inputs({ asOf: day(N - 1 + 7) })), "trend").assessed).toBe(true);
  });
  it("ignores bars after asOf", () => {
    const cut = 400;
    const r = rateIndex(inputs({ asOf: day(cut - 1) }));
    expect(factor(r, "trend").date).toBe(day(cut - 1));
    expect(r.factors.find((f) => f.id === "trend")).toEqual(factor(rateIndex(inputs({ asOf: day(cut - 1), bars: calmUptrend.slice(0, cut) })), "trend"));
  });
  it("needs 200 bars for trend and 273 for volatility", () => {
    const at = (n: number) => rateIndex(inputs({ bars: calmUptrend.slice(0, n), asOf: day(n - 1) }));
    expect(factor(at(199), "trend")).toMatchObject({ assessed: false, notes: ["insufficient-bars"], inputs: { bars: 199 } });
    expect(factor(at(200), "trend").assessed).toBe(true);
    expect(factor(at(272), "volatility").notes).toEqual(["insufficient-bars"]);
    const vol = factor(at(273), "volatility");
    expect(vol.assessed).toBe(true);
    expect(vol.inputs.historySessions).toBe(252);
  });
});

describe("composite basis and suppression", () => {
  it("suppresses without trend even when member factors are strong", () => {
    const r = rateIndex(inputs({ ...strongMembers, bars: calmUptrend.slice(0, 150), asOf: day(149) }));
    expect(r).toMatchObject({ status: "not-enough-data", score: null, band: null, basis: null, basisText: null });
    expect(r.suppressedBy).toEqual(["trend-not-assessed", "volatility-not-assessed"]);
    // breadth 20 + earnings 15 + distribution 10 assessed, none in a composite
    expect(r.coveragePct).toBe(45);
  });
  it("rates price factors alone on the price-only basis", () => {
    const r = rateIndex(inputs());
    expect(r).toMatchObject({ status: "rated", basis: "price-only", score: 100, band: "broad-strength", coveragePct: 40, assessedWeight: 40, earned: 40, suppressedBy: [] });
    expect(r.basisText!.en.label).toBe("Price-based only");
    expect(r.basisText!.sk.label).toBe("Iba podľa ceny");
  });
  it("renormalizes a weak price-only index over 40 points", () => {
    const r = rateIndex(inputs({ bars: stormyDowntrend }));
    expect(r).toMatchObject({ basis: "price-only", score: 0, band: "broad-weakness", coveragePct: 40 });
  });
  it("falls back to price-only when member factors do not reach the full guard", () => {
    // trend 25 + volatility 15 + distribution 10 = 50 < 60
    const r = rateIndex(inputs({ scoreDistribution: weakMembers.scoreDistribution }));
    expect(r).toMatchObject({ basis: "price-only", score: 100, coveragePct: 40, earned: 40 });
    expect(factor(r, "distribution")).toMatchObject({ assessed: true, points: 0, notes: ["not-in-composite"] });
    expect(factor(r, "trend").notes).toEqual([]);
  });
  it("suppresses when volatility is missing and the full guard is not met", () => {
    // trend 25 + earnings 15 + distribution 10 = 50, volatility needs 273 bars
    const r = rateIndex(inputs({ earnings: strongMembers.earnings, scoreDistribution: strongMembers.scoreDistribution, bars: calmUptrend.slice(0, 250), asOf: day(249) }));
    expect(r.suppressedBy).toEqual(["volatility-not-assessed"]);
    expect(r).toMatchObject({ basis: null, score: null, coveragePct: 50 });
  });
  it("uses the full basis without volatility when member factors meet the guard", () => {
    // trend 25 + breadth 20 + earnings 15 = 60
    const r = rateIndex(inputs({ breadth: strongMembers.breadth, earnings: strongMembers.earnings, bars: calmUptrend.slice(0, 250), asOf: day(249) }));
    expect(r).toMatchObject({ basis: "full", coveragePct: 60, score: 100, suppressedBy: [] });
  });
  it("uses the full basis at exactly 60% weight: trend, volatility, breadth", () => {
    const r = rateIndex(inputs({ breadth: strongMembers.breadth }));
    expect(r).toMatchObject({ status: "rated", basis: "full", coveragePct: 60, score: 100, band: "broad-strength" });
    expect(r.basisText!.en.label).toBe("Price and member data");
    expect(factor(r, "breadth").notes).toEqual([]);
  });
  it("renormalizes over assessed factors on the full basis", () => {
    const r = rateIndex(inputs({ breadth: weakMembers.breadth }));
    // 40 / 60 -> 67
    expect(r.score).toBe(67);
    expect(r.band).toBe("constructive");
  });
  it("has neutral basis wording", () => {
    const text = JSON.stringify(INDEX_RATING_BASIS_TEXT).toLowerCase();
    for (const word of ["buy", "sell", "target", "kúp", "predaj", "cieľ"]) expect(text).not.toContain(word);
  });
});

describe("volatility index", () => {
  const vix = (bars = series(N, 0, 0.01, 0.01), change: Partial<IndexRatingInputs> = {}) => rateIndex(inputs({ symbol: "VIX.INDX", bars, isVolatilityIndex: true, ...strongMembers, ...change }));
  it("never gets a composite", () => {
    const r = vix();
    expect(r).toMatchObject({ kind: "volatility", status: "volatility-context", basis: null, basisText: null, score: null, band: null, coveragePct: 0, suppressedBy: ["volatility-index"] });
    expect(r.factors.every((f) => !f.assessed && f.notes[0] === "volatility-index")).toBe(true);
  });
  it.each([
    [10, "low"],
    [30, "normal"],
    [80, "elevated"],
    [95, "high"],
  ])("labels a close at the %sth percentile as %s", (pct, label) => {
    const history = Array.from({ length: 300 }, (_, i) => ({ date: day(i), close: 10 + (i * 7919) % 300 / 10 }));
    const sorted = history.map((b) => b.close).sort((a, b) => a - b);
    const close = sorted[Math.floor((pct / 100) * sorted.length)] + 0.001;
    const r = vix([...history, { date: day(300), close }], { asOf: day(300) });
    expect(r.volatilityRegime).toMatchObject({ assessed: true, label, close, historySessions: 300, date: day(300) });
    expect(r.volatilityRegime!.percentile).toBeCloseTo(pct + 100 / 300, 0);
  });
  it("uses at most three years of prior closes", () => {
    const r = vix(series(N, 0, 0.01, 0.01));
    expect(r.volatilityRegime!.historySessions).toBe(756);
  });
  it("is not assessed with too little history or stale bars", () => {
    expect(vix(series(252, 0, 0.01, 0.01), { asOf: day(251) }).volatilityRegime).toMatchObject({ assessed: false, label: null, notes: ["insufficient-bars"], historySessions: 251 });
    expect(vix(series(253, 0, 0.01, 0.01), { asOf: day(252) }).volatilityRegime!.assessed).toBe(true);
    expect(vix(undefined, { asOf: day(N + 10) }).volatilityRegime).toMatchObject({ assessed: false, notes: ["stale-bars"] });
    expect(vix([]).volatilityRegime).toMatchObject({ assessed: false, notes: ["no-bars"], date: null });
  });
});
