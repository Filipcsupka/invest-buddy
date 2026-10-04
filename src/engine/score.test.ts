import { describe, expect, it } from "vitest";
import { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } from "../data/fixtures";
import { fixtureRecord } from "../data/record";
import { movingAverage, technicalIndicators } from "./indicators";
import { score } from "./score";

const input = (ticker = "NVDA") => ({ ticker, bars: fixtureBars(ticker), fundamentals: fixtureFundamentals(ticker), macro: fixtureMacro(ticker) });
describe("engine", () => {
  it("requires sufficient history and calculates a reproducible average", () => {
    const bars = fixtureBars("NVDA");
    expect(movingAverage(bars.slice(0, 49), 50)).toBeNull();
    expect(movingAverage(bars, 50)).toBeCloseTo(bars.slice(-50).reduce((n, b) => n + b.close, 0) / 50);
    expect(technicalIndicators(bars).ma50TenDaysAgo).not.toBeNull();
    expect(technicalIndicators(bars.slice(0, 59)).ma50TenDaysAgo).toBeNull();
    expect(technicalIndicators(bars.slice(0, 60)).ma50TenDaysAgo).not.toBeNull();
    expect(technicalIndicators(bars.slice(0, 199)).ma200).toBeNull();
    expect(technicalIndicators(bars.slice(0, 200)).ma200).not.toBeNull();
  });
  it("scores all 35 sample tickers within category bounds and keeps an audit trail", () => {
    expect(instruments).toHaveLength(35);
    expect(instruments.filter((instrument) => instrument.source === "guide")).toHaveLength(28);
    for (const { ticker } of instruments) {
      const result = score(input(ticker));
      expect(result.technical).toBeGreaterThanOrEqual(0);
      expect(result.technical).toBeLessThanOrEqual(10);
      expect(result.fundamentals).toBeGreaterThanOrEqual(0);
      expect(result.fundamentals).toBeLessThanOrEqual(10);
      expect(result.macro).toBeGreaterThanOrEqual(0);
      expect(result.macro).toBeLessThanOrEqual(5);
      expect(result.total).toBeLessThanOrEqual(25);
      expect(result.ruleHits).toHaveLength(10);
      expect(result.inputs.bars).toHaveLength(220);
      expect(score(input(ticker))).toEqual(result);
    }
  });
  it("keeps audit inputs stable if the caller changes its objects", () => {
    const candidate = input();
    const result = score(candidate);
    const originalClose = result.inputs.bars[0].close;
    const originalGrowth = result.inputs.fundamentals.revenueGrowthCurrent;
    candidate.bars[0].close = 0;
    candidate.fundamentals.revenueGrowthCurrent = 0;
    expect(result.inputs.bars[0].close).toBe(originalClose);
    expect(result.inputs.fundamentals.revenueGrowthCurrent).toBe(originalGrowth);
  });
  it("overrides a high score for declining revenue", () => {
    const candidate = input();
    candidate.fundamentals = { ...candidate.fundamentals, revenueDeclining: true };
    const result = score(candidate);
    expect(result.state).toBe("Criteria broken");
    expect(result.rejectionReasons).toContain("Declining revenue");
  });
  it("maps score bands to rule states", () => {
    const candidate = input();
    const risingBars = candidate.bars.map((bar, day) => ({ ...bar, close: 100 + day, open: 99 + day, high: 101 + day, low: 98 + day }));
    const high = score({ ...candidate, bars: risingBars, fundamentals: { ...candidate.fundamentals, revenueGrowthCurrent: 40, revenueGrowthPrior: 20, revenueDeclining: false, earningsMissAndGuidanceCut: false, epsBeat: true, productCatalyst: true, insiderOrInstitutionalAccumulation: true }, macro: { growthSectorRotation: true, dataTailwind: true } });
    expect(high.total).toBeGreaterThanOrEqual(18);
    expect(high.state).toBe("Setup met (>=18)");
    const low = score({ ...candidate, bars: risingBars, fundamentals: { ...candidate.fundamentals, revenueGrowthCurrent: 2, revenueGrowthPrior: 20, revenueDeclining: false, earningsMissAndGuidanceCut: false, epsBeat: false, guidanceRaised: false, productCatalyst: false, insiderOrInstitutionalAccumulation: false }, macro: { growthSectorRotation: false, dataTailwind: false } });
    expect(low.state).toBe("Ignore");
  });
  it("recognizes a 5–10% pullback while MA50 is still rising", () => {
    const candidate = input();
    const bars = candidate.bars.map((bar, day) => {
      const close = day >= 215 ? 295 : 100 + day;
      return { ...bar, close, open: close - 1, high: close + 1, low: close - 2 };
    });
    const indicators = technicalIndicators(bars);
    expect(indicators.uptrend).toBe(true);
    expect(indicators.drawdown20).toBeGreaterThanOrEqual(0.05);
    expect(indicators.drawdown20).toBeLessThanOrEqual(0.1);
    const result = score({ ...candidate, bars, fundamentals: { ...candidate.fundamentals, revenueGrowthCurrent: 40, revenueGrowthPrior: 20, revenueDeclining: false, epsBeat: false, guidanceRaised: false, productCatalyst: false, insiderOrInstitutionalAccumulation: false, earningsMissAndGuidanceCut: false }, macro: { growthSectorRotation: false, dataTailwind: true } });
    expect(result.total).toBe(15);
    expect(result.state).toBe("Watch");
    expect(result.pullbackInUptrend).toBe(true);
  });
  it("keeps exact score boundaries in separate rule states", () => {
    const base = input();
    const bars = base.bars.map((bar, day) => {
      const close = 100 + day;
      const open = close + (day % 2 ? 1 : -1);
      return { ...bar, close, open, high: Math.max(close, open) + 1, low: Math.min(close, open) - 1, volume: 100 };
    });
    const cases: [number, boolean, boolean, boolean, boolean, boolean, string][] = [
      [11, true, false, false, true, false, "Ignore"],
      [12, true, false, true, false, false, "Wait"],
      [14, true, true, false, true, false, "Wait"],
      [15, true, true, true, false, false, "Watch"],
      [17, true, true, true, false, true, "Watch"],
      [18, true, true, true, true, true, "Setup met (>=18)"],
    ];
    for (const [total, acceleration, earnings, catalyst, accumulation, rotation, state] of cases) {
      const result = score({ ...base, bars, fundamentals: { ...base.fundamentals, revenueGrowthCurrent: acceleration ? 40 : 10, revenueGrowthPrior: 20, revenueDeclining: false, earningsMissAndGuidanceCut: false, epsBeat: earnings, guidanceRaised: false, productCatalyst: catalyst, insiderOrInstitutionalAccumulation: accumulation }, macro: { growthSectorRotation: rotation, dataTailwind: false } });
      expect(result.total).toBe(total);
      expect(result.state).toBe(state);
      expect(result.pullbackInUptrend).toBe(false);
    }
  });
  it("rejects each broken criterion independently", () => {
    const base = input();
    const cases: [string, (candidate: ReturnType<typeof input>) => void][] = [
      ["Declining revenue", (candidate) => { candidate.fundamentals.revenueDeclining = true; }],
      ["Declining revenue", (candidate) => { candidate.fundamentals.revenueGrowthCurrent = -1; }],
      ["Earnings miss and guidance cut", (candidate) => { candidate.fundamentals.earningsMissAndGuidanceCut = true; }],
      ["Long-term downtrend: close below MA200", (candidate) => { candidate.bars = candidate.bars.map((bar, i) => { const close = i < 170 ? 200 : 100; return { ...bar, open: close, high: close + 1, low: close - 1, close }; }); }],
      ["Long-term downtrend: MA50 below MA200", (candidate) => { candidate.bars = candidate.bars.map((bar, i) => { const close = i === 219 ? 220 : i < 170 ? 200 : 100; return { ...bar, open: close, high: close + 1, low: close - 1, close }; }); }],
      ["No revenue or meme-pump flag", (candidate) => { candidate.fundamentals.noRevenue = true; }],
      ["No revenue or meme-pump flag", (candidate) => { candidate.fundamentals.memePump = true; }],
    ];
    for (const [reason, change] of cases) {
      const candidate = structuredClone(base);
      change(candidate);
      const result = score(candidate);
      expect(result.state).toBe("Criteria broken");
      expect(result.rejectionReasons).toContain(reason);
    }
  });
  it("never reports a setup when MA50 is below MA200, even with 18+ points", () => {
    const base = input();
    const bars = base.bars.map((bar, i) => {
      const close = i === 219 ? 220 : i < 170 ? 200 : 100;
      const open = close + (i % 2 ? 1 : -1);
      return { ...bar, close, open, high: Math.max(close, open) + 1, low: Math.min(close, open) - 1, volume: i % 2 ? 100 : 200 };
    });
    const result = score({ ...base, bars, fundamentals: { ...base.fundamentals, revenueGrowthCurrent: 40, revenueGrowthPrior: 20, revenueDeclining: false, epsBeat: true, guidanceRaised: false, earningsMissAndGuidanceCut: false, productCatalyst: true, insiderOrInstitutionalAccumulation: true, noRevenue: false, memePump: false }, macro: { growthSectorRotation: true, dataTailwind: true } });
    expect(result.total).toBeGreaterThanOrEqual(18);
    expect(result.rejectionReasons).toContain("Long-term downtrend: MA50 below MA200");
    expect(result.state).toBe("Criteria broken");
  });
  it("does not score short or invalid inputs", () => {
    const base = input();
    const cases: [string, (candidate: ReturnType<typeof input>) => void][] = [
      ["200 price bars", (candidate) => { candidate.bars = candidate.bars.slice(0, 199); }],
      ["OHLCV", (candidate) => { candidate.bars[0].close = Number.NaN; }],
      ["OHLCV", (candidate) => { candidate.bars[0].volume = -1; }],
      ["OHLCV", (candidate) => { candidate.bars[0].high = candidate.bars[0].low - 1; }],
      ["date", (candidate) => { candidate.bars[1].date = candidate.bars[0].date; }],
      ["date", (candidate) => { [candidate.bars[0], candidate.bars[1]] = [candidate.bars[1], candidate.bars[0]]; }],
      ["fundamentals", (candidate) => { candidate.fundamentals.revenueGrowthCurrent = Number.NaN; }],
      ["macro", (candidate) => { candidate.macro.dataTailwind = undefined as unknown as boolean; }],
    ];
    for (const [reason, change] of cases) {
      const candidate = structuredClone(base);
      change(candidate);
      const result = score(candidate);
      expect(result.state).toBe("Insufficient/invalid data");
      expect(result.invalidReasons.join(" ")).toContain(reason);
      expect(result.total).toBe(0);
      expect(result.ruleHits).toEqual([]);
    }
    expect(score({ ...base, bars: base.bars.slice(0, 200) }).state).not.toBe("Insufficient/invalid data");
  });
  it("requires positive volume on both sides of the comparison", () => {
    const base = input();
    const zero = base.bars.map((bar) => ({ ...bar, volume: 0 }));
    expect(score({ ...base, bars: zero }).invalidReasons).toEqual([]);
    expect(technicalIndicators(zero).volumeOnGreen).toBe(false);
    const redZero = base.bars.map((bar) => ({ ...bar, volume: bar.close < bar.open ? 0 : bar.volume }));
    expect(technicalIndicators(redZero).volumeOnGreen).toBe(false);
    const oneMissing = base.bars.map((bar) => ({ ...bar }));
    oneMissing[oneMissing.length - 1].volume = 0;
    expect(technicalIndicators(oneMissing).volumeOnGreen).toBe(false);
  });
  it("records every sample ticker at three dated sessions", () => {
    const record = fixtureRecord();
    expect(record).toHaveLength(instruments.length * 3);
    expect(new Set(record.map((row) => row.result.asOf)).size).toBe(3);
  });
  it("golden fixture result remains stable", () => {
    const result = score(input("NVDA"));
    expect({ technical: result.technical, fundamentals: result.fundamentals, macro: result.macro, total: result.total, state: result.state }).toMatchInlineSnapshot(`
      {
        "fundamentals": 7,
        "macro": 3,
        "state": "Criteria broken",
        "technical": 2,
        "total": 12,
      }
    `);
  });
});
