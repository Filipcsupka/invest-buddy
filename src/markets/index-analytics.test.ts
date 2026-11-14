import { describe, expect, it } from "vitest";
import {
  breadth, componentGrowth, CRITERIA_BROKEN, earningsSummary, indexAnalytics, isVolatilityIndex, percentileRank, priceAnalytics, realizedVol,
  relativeStrength, scoreDistribution, sectors, SETUP_MET, sessionReturn, sma, toRatingInputs, volatilityContext,
  type ComponentFacts, type GrowthFact, type IndexBar,
} from "./index-analytics";

/** Weekday dates from 2021-11-08 (the first stored index bar), one per session. */
function sessions(count: number, start = "2021-11-08"): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}
const series = (closes: number[]): IndexBar[] => sessions(closes.length).map((date, i) => ({ date, close: closes[i] }));
const component = (over: Partial<ComponentFacts>): ComponentFacts => ({ code: "X", exchange: "US", vendorSymbol: "X.US", ticker: null, name: null, sector: null, industry: null, weight: null, ...over });

describe("price measures", () => {
  it("computes averages, returns and volatility from closes", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2, 3, 4], 2, 2)).toBe(1.5);
    expect(sma([1, 2], 3)).toBeNull();
    expect(sessionReturn([100, 110], 1)).toBeCloseTo(0.1);
    expect(sessionReturn([100], 1)).toBeNull();
    expect(realizedVol(Array.from({ length: 30 }, () => 100))).toBe(0);
    const alternating = Array.from({ length: 21 }, (_, i) => (i % 2 ? 101 : 100));
    expect(realizedVol(alternating)).toBeGreaterThan(0.1);
    expect(realizedVol([100, 101], 20)).toBeNull();
    expect(percentileRank(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10)).toBe(50);
    expect(percentileRank(5, [1, 2], 10)).toBeNull();
  });

  it("reads trend, range, drawdown and the volatility percentile from five years of bars", () => {
    // 1,000 rising sessions to 200, then 300 sessions falling 10% in a straight line.
    const closes = [...Array.from({ length: 1000 }, (_, i) => 100 + (i * 100) / 999), ...Array.from({ length: 300 }, (_, i) => 200 - ((i + 1) * 20) / 300)];
    const bars = series(closes);
    const p = priceAnalytics(bars);
    expect(p.sessions).toBe(1300);
    expect(p.last).toBeCloseTo(180);
    expect(p.ma50).toBeCloseTo(sma(closes, 50)!);
    expect(p.ma50Slope20).toBeLessThan(0);
    expect(p.distanceMa200).toBeLessThan(0);
    expect(p.drawdownFromHigh).toBeCloseTo(-0.1);
    expect(p.highDate).toBe(bars[999].date);
    expect(p.range52w.low).toBeCloseTo(180);
    expect(p.range52w.positionPct).toBe(0);
    expect(p.returns.d1).toBeCloseTo(180 / (200 - (299 * 20) / 300) - 1);
    expect(p.returns.y1).toBeCloseTo(180 / closes[1300 - 253] - 1);
    // YTD base is the last close of the prior calendar year.
    const lastYear = Number(p.asOf!.slice(0, 4)) - 1;
    const base = [...bars].reverse().find((bar) => bar.date < `${lastYear + 1}-01-01`)!;
    expect(p.returns.ytd).toBeCloseTo(180 / base.close - 1);
    expect(p.vol20).not.toBeNull();
    expect(p.vol20HistoryN).toBe(756);
    expect(p.vol20Percentile3y).toBeGreaterThanOrEqual(0);
  });

  it("uses stored highs and lows for the 52-week range and handles an empty series", () => {
    const p = priceAnalytics([{ date: "2026-11-10", close: 10, high: 12, low: 8 }, { date: "2026-11-11", close: 11, high: 11.5, low: 9 }]);
    expect(p.range52w).toEqual({ high: 12, low: 8, positionPct: 75 });
    expect(p.ma50).toBeNull();
    const empty = priceAnalytics([]);
    expect(empty).toMatchObject({ asOf: null, last: null, drawdownFromHigh: null, vol20: null, range52w: { high: null, low: null } });
  });
});

describe("relative strength", () => {
  it("ranks local-currency returns against the other indices and leaves VIX out", () => {
    const flat = (end: number) => series([...Array.from({ length: 70 }, () => 100), end]);
    const peers = [
      { symbol: "GSPC.INDX", currency: "USD", bars: flat(110) },
      { symbol: "GDAXI.INDX", currency: "EUR", bars: flat(105) },
      { symbol: "N225.INDX", currency: "JPY", bars: flat(95) },
      { symbol: "VIX.INDX", currency: "USD", bars: flat(300) },
      { symbol: "NEW.INDX", currency: "USD", bars: series([100]) },
    ];
    const rs = relativeStrength("GDAXI.INDX", peers, "m3");
    expect(rs).toMatchObject({ currencyBasis: "local", rank: 2, of: 3 });
    expect(rs.value).toBeCloseTo(0.05);
    expect(rs.peerMedian).toBeCloseTo(0.025);
    expect(rs.spread).toBeCloseTo(0.025);
    expect(relativeStrength("NEW.INDX", peers, "m3")).toMatchObject({ value: null, rank: null, spread: null });
    expect(relativeStrength("GSPC.INDX", peers, "y1")).toMatchObject({ value: null, of: 0 });
    const stale = { symbol: "OLD.INDX", currency: "USD", bars: flat(200).map((bar) => ({ ...bar, date: `${Number(bar.date.slice(0, 4)) - 1}${bar.date.slice(4)}` })) };
    expect(relativeStrength("GSPC.INDX", [...peers, stale], "m3")).toMatchObject({ rank: 1, of: 3 });
  });
});

describe("constituent analytics", () => {
  const asOf = "2026-11-12";
  const list: ComponentFacts[] = [
    component({ code: "A", ticker: "A", sector: "Tech", weight: 0.5, barDate: asOf, close: 110, ma50: 100, ma200: 90, state: SETUP_MET, stateAsOf: asOf }),
    component({ code: "B", ticker: "B", sector: "Tech", weight: 0.3, barDate: asOf, close: 95, ma50: 100, ma200: null, state: CRITERIA_BROKEN, stateAsOf: asOf }),
    component({ code: "C", ticker: "C", sector: "Energy", weight: 0.2, barDate: "2026-10-01", close: 50, ma50: 40, ma200: 30, state: "Watch", stateAsOf: "2026-10-01" }),
    component({ code: "D", sector: null, weight: null }),
  ];

  it("measures breadth over fresh bars, against the whole list", () => {
    const b = breadth(list, asOf);
    expect(b.aboveMa50).toEqual({ value: 50, n: 2, of: 4, asOf });
    expect(b.aboveMa200).toEqual({ value: 100, n: 1, of: 4, asOf });
    expect(breadth([], asOf).aboveMa50).toEqual({ value: null, n: 0, of: 0, asOf: null });
  });

  it("counts sectors and gives weights only when every constituent has one", () => {
    const partial = sectors(list, "2026-11-08");
    expect(partial.rows).toEqual([{ sector: "Tech", count: 2, weightPct: null }, { sector: "Energy", count: 1, weightPct: null }]);
    expect(partial.weightCoverage).toEqual({ value: 75, n: 3, of: 4, asOf: "2026-11-08" });
    expect(partial.sectorCoverage).toMatchObject({ n: 3, of: 4 });
    const full = sectors(list.slice(0, 3), "2026-11-08");
    expect(full.rows).toEqual([{ sector: "Tech", count: 2, weightPct: 80 }, { sector: "Energy", count: 1, weightPct: 20 }]);
    expect(sectors([component({ sector: "Tech", weight: 0.2 })], asOf).rows[0].weightPct).toBeNull();
  });

  it("counts fresh published rule states with the scored denominator", () => {
    const s = scoreDistribution(list, asOf);
    expect(s.setupMet).toEqual({ value: 50, n: 2, of: 4, asOf });
    expect(s.criteriaBroken.value).toBe(50);
    expect(s.states).toEqual({ [SETUP_MET]: 1, [CRITERIA_BROKEN]: 1 });
    expect(s.scored).toEqual({ value: 50, n: 2, of: 4, asOf });
  });
});

describe("growth from stored filings", () => {
  const q = (ticker: string, periodEnd: string, value: number, concept = "Revenues", source = "sec", period: "quarter" | "half" = "quarter"): GrowthFact => ({ ticker, source, concept, period, periodEnd, value });
  const facts: GrowthFact[] = [
    // A: revenue 100 -> 120 (+20%), prior quarter 100 -> 110 (+10%): accelerating; net income up.
    q("A", "2025-06-30", 100), q("A", "2025-09-30", 100), q("A", "2026-06-30", 110), q("A", "2026-09-30", 120),
    q("A", "2025-09-30", 10, "NetIncomeLoss"), q("A", "2026-09-30", 12, "NetIncomeLoss"),
    // B: revenue up, net income down from a loss to a bigger loss.
    q("B", "2025-09-30", 50), q("B", "2026-09-30", 55), q("B", "2025-09-30", -5, "NetIncomeLoss"), q("B", "2026-09-30", -8, "NetIncomeLoss"),
    // C: vendor half-years only, revenue down.
    q("C", "2025-06-30", 80, "Revenues", "eodhd", "half"), q("C", "2026-06-30", 70, "Revenues", "eodhd", "half"),
    // D: a single period, no year-ago value.
    q("D", "2026-09-30", 10),
  ];

  it("derives year-on-year growth, acceleration and the net income direction per ticker", () => {
    const growth = componentGrowth(facts);
    expect(growth.get("A")).toEqual({ ticker: "A", periodEnd: "2026-09-30", period: "quarter", revenueYoy: expect.closeTo(0.2), revenueUp: true, revenueAccelerating: true, earningsUp: true, earningsYoy: expect.closeTo(0.2) });
    expect(growth.get("B")).toMatchObject({ revenueUp: true, revenueAccelerating: null, earningsUp: false, earningsYoy: null });
    expect(growth.get("C")).toMatchObject({ periodEnd: "2026-06-30", period: "half", revenueUp: false, earningsUp: null });
    expect(growth.has("D")).toBe(false);
  });

  it("prefers the latest revenue series and SEC quarters on the same period end", () => {
    const growth = componentGrowth([q("E", "2025-09-30", 100, "Revenues", "eodhd"), q("E", "2026-09-30", 90, "Revenues", "eodhd"),
      q("E", "2025-09-30", 100, "SalesRevenueNet"), q("E", "2026-09-30", 130, "SalesRevenueNet")]);
    expect(growth.get("E")?.revenueYoy).toBeCloseTo(0.3);
  });

  it("weights shares by index weight only when every assessed constituent has one", () => {
    const growth = componentGrowth(facts);
    const list = [
      component({ ticker: "A", weight: 0.6 }), component({ ticker: "B", weight: 0.3 }), component({ ticker: "C", weight: 0.1 }), component({ ticker: "D", weight: 0.05 }), component({ ticker: null }),
    ];
    const e = earningsSummary(list, growth);
    expect(e.weighted).toBe(true);
    expect(e.positiveGrowth).toEqual({ value: 66.67, n: 2, of: 5, asOf: "2026-09-30" });
    expect(e.revenueUp.value).toBe(90);
    expect(e.earningsUp).toMatchObject({ value: expect.closeTo(66.67), n: 2 });
    expect(e.accelerating).toMatchObject({ value: 100, n: 1, of: 5 });
    expect(e.medianRevenueYoy).toBeCloseTo(0.1);
    expect(e.weightedRevenueYoyPct).toMatchObject({ value: 13.75, n: 3, of: 5 });
    expect(e.weightedEarningsYoyPct).toMatchObject({ value: 20, n: 1, of: 5 });
    const unweighted = earningsSummary([component({ ticker: "A", weight: 0.6 }), component({ ticker: "B" })], growth);
    expect(unweighted.weighted).toBe(false);
    expect(unweighted.positiveGrowth.value).toBe(50);
    expect(unweighted.weightedRevenueYoyPct.value).toBeNull();
    expect(earningsSummary(list, growth, "2028-11-12").positiveGrowth.n).toBe(0);
    expect(e.periodEnds).toEqual({ oldest: "2026-06-30", median: "2026-09-30", newest: "2026-09-30" });
  });

  it("counts only members whose latest quarter is within 200 days, or half-year within 380, of the index date", () => {
    const growth = componentGrowth(facts);
    const list = [component({ ticker: "A" }), component({ ticker: "B" }), component({ ticker: "C" })];
    // 2027-04-18 is 200 days after the 2026-09-30 quarters and 292 after C's 2026-06-30 half-year: all three count.
    expect(earningsSummary(list, growth, "2027-04-18")).toMatchObject({ revenueUp: { n: 3 }, periodEnds: { oldest: "2026-06-30", median: "2026-09-30" } });
    // One day later the quarters (A, B) are 201 days old; C's half-year is still within 380 days.
    const later = earningsSummary(list, growth, "2027-04-19");
    expect(later.revenueUp).toMatchObject({ value: 0, n: 1, of: 3, asOf: "2026-06-30" });
    expect(later.periodEnds).toEqual({ oldest: "2026-06-30", median: "2026-06-30", newest: "2026-06-30" });
    // 381 days after C's half-year nothing counts; a period ending after the index date never counts.
    expect(earningsSummary(list, growth, "2027-07-16")).toMatchObject({ revenueUp: { value: null, n: 0 }, periodEnds: null });
    expect(earningsSummary(list, growth, "2026-09-29").revenueUp.n).toBe(1);
  });
});

describe("index analytics and rating inputs", () => {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + i / 10);
  const bars = sessions(closes.length, "2025-09-01").map((date, i) => ({ date, close: closes[i] }));
  const asOf = bars.at(-1)!.date;

  it("builds the agreed rating input shape with coverage", () => {
    const components: ComponentFacts[] = [
      component({ code: "A", ticker: "A", weight: null, barDate: asOf, close: 10, ma50: 9, ma200: 8, state: SETUP_MET, stateAsOf: asOf }),
      component({ code: "B", ticker: "B", barDate: asOf, close: 10, ma50: 11, ma200: 12, state: CRITERIA_BROKEN, stateAsOf: asOf }),
      component({ code: "C" }), component({ code: "D" }),
    ];
    const growthFacts: GrowthFact[] = ["A", "B"].flatMap((ticker) => [
      { ticker, source: "sec", concept: "Revenues", period: "quarter" as const, periodEnd: "2025-06-30", value: 100 },
      { ticker, source: "sec", concept: "Revenues", period: "quarter" as const, periodEnd: "2025-09-30", value: 100 },
      { ticker, source: "sec", concept: "Revenues", period: "quarter" as const, periodEnd: "2026-06-30", value: 105 },
      { ticker, source: "sec", concept: "Revenues", period: "quarter" as const, periodEnd: "2026-09-30", value: ticker === "A" ? 120 : 90 },
      { ticker, source: "sec", concept: "NetIncomeLoss", period: "quarter" as const, periodEnd: "2025-09-30", value: 10 },
      { ticker, source: "sec", concept: "NetIncomeLoss", period: "quarter" as const, periodEnd: "2026-09-30", value: ticker === "A" ? 12 : 8 },
    ]);
    const analytics = indexAnalytics({ symbol: "GSPC.INDX", bars, componentsAsOf: asOf, components, growthFacts, peers: [{ symbol: "GSPC.INDX", currency: "USD", bars }] });
    expect(analytics.matched).toEqual({ value: 50, n: 2, of: 4, asOf });
    expect(analytics.relativeStrength?.m3).toMatchObject({ rank: 1, of: 1, peerMedian: null });
    const inputs = toRatingInputs(analytics, bars);
    expect(inputs).toEqual({
      symbol: "GSPC.INDX", asOf, bars: bars.map(({ date, close }) => ({ date, close })), valuation: null, isVolatilityIndex: false,
      components: { matched: 2, total: 4 },
      breadth: { date: asOf, aboveMa50Pct: 50, aboveMa200Pct: 50, coveragePct: 50 },
      earnings: { date: asOf, oldestPeriodEnd: "2026-09-30", medianPeriodEnd: "2026-09-30", positiveGrowthPct: 50, acceleratingPct: 50, coveragePct: 50 },
      scoreDistribution: { date: asOf, setupMetPct: 50, criteriaBrokenPct: 50, coveragePct: 50 },
    });

    // A list more than 14 days older than the latest bar keeps membership and sectors but feeds no member figures.
    const listDate = bars.at(-12)!.date;
    const stale = indexAnalytics({ symbol: "GSPC.INDX", bars, componentsAsOf: listDate, components, growthFacts });
    expect(stale).toMatchObject({ asOf, matched: { n: 2, of: 4, asOf: listDate }, breadth: null, earnings: null, scores: null });
    expect(stale.sectors).not.toBeNull();
    expect(toRatingInputs(stale, bars)).toEqual({ symbol: "GSPC.INDX", asOf, bars: expect.any(Array), valuation: null, isVolatilityIndex: false, components: { matched: 2, total: 4 } });
    const recent = indexAnalytics({ symbol: "GSPC.INDX", bars, componentsAsOf: bars.at(-10)!.date, components, growthFacts });
    expect(recent.breadth).not.toBeNull();
  });

  it("drops members whose bar or rule state is older than the engine's seven-day limit", () => {
    const old = (days: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    const list = [component({ code: "A", ticker: "A", barDate: old(7), close: 10, ma50: 9, ma200: 8, state: SETUP_MET, stateAsOf: old(7) }),
      component({ code: "B", ticker: "B", barDate: old(8), close: 10, ma50: 9, ma200: 8, state: SETUP_MET, stateAsOf: old(8) })];
    expect(breadth(list, asOf).aboveMa50).toMatchObject({ n: 1, of: 2 });
    expect(scoreDistribution(list, asOf).scored).toMatchObject({ n: 1, of: 2 });
  });

  it("omits constituent blocks without data and keeps a volatility index to price context", () => {
    const bare = toRatingInputs(indexAnalytics({ symbol: "N225.INDX", bars, componentsAsOf: "2026-11-06", components: [component({ code: "7203" })], growthFacts: [] }), bars);
    expect(bare).toEqual({ symbol: "N225.INDX", asOf: "2026-11-06", bars: expect.any(Array), valuation: null, isVolatilityIndex: false, components: { matched: 0, total: 1 } });
    expect(isVolatilityIndex("vix.indx")).toBe(true);
    const vix = indexAnalytics({ symbol: "VIX.INDX", bars, componentsAsOf: null, components: [component({ code: "A", ticker: "A" })], growthFacts: [], peers: [{ symbol: "VIX.INDX", currency: "USD", bars }] });
    expect(vix).toMatchObject({ isVolatilityIndex: true, matched: null, breadth: null, scores: null, relativeStrength: null });
    expect(vix.volatility).toMatchObject({ symbol: "VIX.INDX", asOf, level: closes.at(-1), historyN: 300 });
    expect(vix.volatility?.levelPercentile3y).toBe(100);
    expect(toRatingInputs(vix, bars)).toEqual({ symbol: "VIX.INDX", asOf, bars: expect.any(Array), valuation: null, isVolatilityIndex: true });
    expect(volatilityContext("VIX.INDX", []).level).toBeNull();
  });
});
