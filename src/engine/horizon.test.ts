import { describe, expect, it } from "vitest";
import { HORIZON_RULES, horizonProfile, yoySeries, type QuarterRevenue } from "./horizon";
import { exitFacts } from "./exit-facts";
import type { OHLCV } from "./types";

const date = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const bars = (n: number, f: (i: number) => { close: number; spread?: number; volume?: number }): OHLCV[] =>
  Array.from({ length: n }, (_, i) => { const { close, spread = 1, volume = 1_000_000 } = f(i); return { date: date(i), open: close, high: close + spread / 2, low: close - spread / 2, close, volume }; });
const quarters = (yoys: number[]): QuarterRevenue[] => {
  // newest first yoys; build 4 current quarters and 4 year-ago quarters at 100.
  const ends = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"], ago = ["2025-06-30", "2025-03-31", "2024-12-31", "2024-09-30"];
  return [...ends.map((e, i) => ({ periodEnd: e, value: 100 * (1 + yoys[i] / 100) })), ...ago.map((e) => ({ periodEnd: e, value: 100 }))];
};
const calm = bars(100, () => ({ close: 100, spread: 2 }));

describe("yoySeries", () => {
  it("returns newest first and stops at a missing year-ago quarter", () => {
    expect(yoySeries(quarters([30, 28, 26, 24]), 4)).toEqual([30, 28, 26, 24]);
    expect(yoySeries([{ periodEnd: "2026-06-30", value: 10 }], 4)).toEqual([]);
  });
});

describe("horizonProfile", () => {
  const base = { bars: calm, revenue: quarters([30, 28, 26, 24]), marketCapUsd: 50e9, flags: [], tier: 1 };
  it("labels a large, calm, steady grower as sustained", () => {
    const bigVolume = bars(100, () => ({ close: 100, spread: 2, volume: 5_000_000 }));
    const result = horizonProfile({ ...base, bars: bigVolume });
    expect(result.profile).toBe("sustained");
    expect(result.values.drawdownPercent).toBe(1);
  });
  it("labels a small cap with a one-quarter revenue spike as event", () => {
    const r = horizonProfile({ ...base, revenue: quarters([90, 20, 18, 16]), marketCapUsd: 2e9 });
    expect(r.profile).toBe("event");
    expect(r.reasons).toEqual(expect.arrayContaining(["revenue_spike", "small_cap"]));
  });
  it("labels a recent 20 percent jump on heavy volume as event for a mid cap", () => {
    const spiky = bars(100, (i) => ({ close: i < 95 ? 100 : 120, spread: 2, volume: i === 99 ? 20_000_000 : 5_000_000 }));
    expect(horizonProfile({ ...base, marketCapUsd: 10e9, bars: spiky }).reasons).toEqual(expect.arrayContaining(["price_move", "volume_spike"]));
  });
  it("a large steady grower keeps its label through a one-day volume spike", () => {
    const spiky = bars(100, (i) => ({ close: 100, spread: 2, volume: i === 99 ? 20_000_000 : 5_000_000 }));
    expect(horizonProfile({ ...base, bars: spiky }).profile).toBe("sustained");
  });
  it("is mixed when growth is not sustained and nothing is eventful", () => {
    expect(horizonProfile({ ...base, revenue: quarters([30, 28, 26, 5]), bars: bars(100, () => ({ close: 100, spread: 2, volume: 5_000_000 })) }).profile).toBe("mixed");
  });
  it("is no data with short history, missing market cap or fewer than 4 growth quarters", () => {
    expect(horizonProfile({ ...base, bars: calm.slice(-30) }).profile).toBe("no-data");
    expect(horizonProfile({ ...base, marketCapUsd: null }).profile).toBe("no-data");
    expect(horizonProfile({ ...base, revenue: quarters([30, 28, 26, 24]).slice(0, 5) }).profile).toBe("no-data");
  });
  it("a flagged company is event, never sustained", () => {
    const r = horizonProfile({ ...base, bars: bars(100, () => ({ close: 100, spread: 2, volume: 5_000_000 })), flags: [{ id: "dilution", state: "flagged", values: {} }] });
    expect(r.profile).toBe("event");
  });
  it("carries its own version", () => expect(HORIZON_RULES.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/));
});

describe("exitFacts", () => {
  it("is empty with short history", () => expect(exitFacts(calm.slice(-20)).trailingLevel).toBeNull());
  it("flags a close under the 50-day average on 2x volume", () => {
    const b = bars(80, (i) => ({ close: i < 79 ? 100 : 90, spread: 2, volume: i === 79 ? 2_500_000 : 1_000_000 }));
    expect(exitFacts(b).maBreak).toBe(true);
  });
  it("does not flag the same break on normal volume", () => {
    const b = bars(80, (i) => ({ close: i < 79 ? 100 : 90, spread: 2 }));
    expect(exitFacts(b).maBreak).toBe(false);
  });
  it("closes below the ATR trailing level after a drop from the peak", () => {
    const f = exitFacts(bars(80, (i) => ({ close: 100 + i, spread: 2 })));
    expect(f.closeBelowTrailing).toBe(false);
    expect(exitFacts(bars(80, (i) => ({ close: i < 70 ? 100 + i : 150 - (i - 69) * 5, spread: 2 }))).closeBelowTrailing).toBe(true);
  });
  it("gain from cost only with a cost basis; review mark at 25 percent", () => {
    const b = bars(80, () => ({ close: 125, spread: 2 }));
    expect(exitFacts(b).gainFromCostPercent).toBeNull();
    expect(exitFacts(b, 100)).toMatchObject({ gainFromCostPercent: 25, reviewMarkReached: true });
    expect(exitFacts(b, 110).reviewMarkReached).toBe(false);
  });
});
