import { describe, expect, it } from "vitest";
import { atrPercent, computeTechnicals, regimeOf, ret, rsi, type Bar } from "./technicals";

const bars = (closes: number[], volume = 1000): Bar[] => closes.map((c, i) => ({ date: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), open: c, high: c * 1.01, low: c * 0.99, close: c, volume }));
const up = (n: number, step = 0.5, start = 50) => Array.from({ length: n }, (_, i) => start + i * step);

describe("technicals", () => {
  it("returns null under 200 bars", () => expect(computeTechnicals(bars(up(199)))).toBeNull());
  it("computes returns, averages and ranges on a straight line", () => {
    const t = computeTechnicals(bars(up(260)))!;
    expect(t.close).toBe(179.5);
    expect(t.return1dPercent).toBe(0.28);
    expect(t.return20dPercent).toBe(5.9);
    expect(t.vsMa20Percent).toBeGreaterThan(0);
    expect(t.vsMa200Percent).toBeGreaterThan(t.vsMa50Percent!);
    expect(t.rsi14).toBe(100);
    expect(t.regime).toBe("uptrend");
    expect(t.volumeRatio).toBe(1);
    expect(t.avgVolume20).toBe(1000);
    expect(t.rangePosition52w).toBeGreaterThan(95);
    expect(t.atrPercent14).toBeGreaterThan(0);
    expect(t.relativeStrength20).toBeNull();
  });
  it("relative strength is the stock return minus SPY over the same sessions", () => {
    const stock = bars(up(260, 0.5));
    const spy = bars(up(260, 0.1, 400));
    const t = computeTechnicals(stock, spy)!;
    expect(t.relativeStrength20).toBe(Number((ret(stock.map((b) => b.close), 20)! - ret(spy.map((b) => b.close), 20)!).toFixed(2)));
    expect(t.relativeStrength60).toBeGreaterThan(0);
  });
  it("labels a 7 percent dip in an uptrend as pullback and a break under the MA200 as downtrend", () => {
    const dip = [...up(250), ...[0.99, 0.97, 0.95, 0.94, 0.93, 0.92, 0.925, 0.93, 0.93, 0.93].map((k) => k * 175)];
    expect(computeTechnicals(bars(dip))!.regime).toBe("pullback");
    const down = Array.from({ length: 260 }, (_, i) => 200 - i * 0.4);
    expect(computeTechnicals(bars(down))!.regime).toBe("downtrend");
    expect(regimeOf(100, 90, 80, 12)).toBe("deep_pullback");
    expect(regimeOf(100, null, null, 0)).toBe("range");
  });
  it("RSI is 50 on a flat series, 0 on a straight fall and ATR is a percent of the close", () => {
    expect(rsi(Array(30).fill(10))).toBe(50);
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 - i))).toBe(0);
    expect(atrPercent(bars(Array(30).fill(100)))).toBe(2);
  });
  it("is deterministic and leaves the input alone", () => {
    const input = bars(up(260));
    const copy = JSON.stringify(input);
    expect(computeTechnicals(input)).toEqual(computeTechnicals(JSON.parse(copy)));
    expect(JSON.stringify(input)).toBe(copy);
  });
});
