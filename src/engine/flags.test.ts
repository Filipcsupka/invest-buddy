import { describe, expect, it } from "vitest";
import { companyFlags, FLAG_IDS, type FlagInput } from "./flags";
import type { OHLCV } from "./types";

const bar = (i: number, close: number, volume: number, high = close): OHLCV => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, open: close, high, low: close, close, volume });
const bars = (close: number, volume: number, n = 20) => Array.from({ length: n }, (_, i) => bar(i, close, volume));
const base: FlagInput = { bars: [], shares: [], operatingIncome: null, interestExpense: null, shortInterestPercent: null };
const by = (input: Partial<FlagInput>) => Object.fromEntries(companyFlags({ ...base, ...input }).map((f) => [f.id, f]));

describe("company flags", () => {
  it("returns the five flags in fixed order, all no data when nothing is stored", () => {
    const flags = companyFlags(base);
    expect(flags.map((f) => f.id)).toEqual([...FLAG_IDS]);
    expect(flags.every((f) => f.state === "no-data" && Object.keys(f.values).length === 0)).toBe(true);
  });

  it("flags dilution at 10% or more over about a year and clears smaller growth", () => {
    const up = by({ shares: [{ periodEnd: "2026-09-30", value: 120 }, { periodEnd: "2025-09-30", value: 100 }] }).dilution;
    expect(up.state).toBe("flagged");
    expect(up.values.change).toBe(20);
    const small = by({ shares: [{ periodEnd: "2025-09-30", value: 100 }, { periodEnd: "2026-09-30", value: 105 }] }).dilution;
    expect(small.state).toBe("clear");
  });

  it("has no dilution data from one count, or two counts under a year apart", () => {
    expect(by({ shares: [{ periodEnd: "2026-09-30", value: 120 }] }).dilution.state).toBe("no-data");
    expect(by({ shares: [{ periodEnd: "2026-09-30", value: 120 }, { periodEnd: "2026-06-30", value: 100 }] }).dilution.state).toBe("no-data");
    expect(by({ shares: [{ periodEnd: "bad", value: 120 }, { periodEnd: "2025-01-01", value: 0 }] }).dilution.state).toBe("no-data");
  });

  it("flags low trading value over 20 sessions and treats a short history as no data", () => {
    expect(by({ bars: bars(10, 100_000) }).illiquid.state).toBe("flagged");
    expect(by({ bars: bars(10, 1_000_000) }).illiquid.state).toBe("clear");
    expect(by({ bars: bars(10, 1_000_000, 19) }).illiquid.state).toBe("no-data");
  });

  it("flags drawdown of 20% or more under the 20-day high", () => {
    const down = [...bars(100, 1_000_000, 19), bar(19, 75, 1_000_000, 75)];
    expect(by({ bars: down }).drawdown.state).toBe("flagged");
    expect(by({ bars: down }).drawdown.values.percent).toBe(25);
    expect(by({ bars: bars(100, 1_000_000) }).drawdown.state).toBe("clear");
    expect(by({ bars: bars(100, 1_000_000, 5) }).drawdown.state).toBe("no-data");
  });

  it("needs both operating income and positive interest expense for interest cover", () => {
    expect(by({ operatingIncome: 100, interestExpense: 50 }).interestCover.state).toBe("clear");
    expect(by({ operatingIncome: 50, interestExpense: 100 }).interestCover.state).toBe("flagged");
    expect(by({ operatingIncome: 100, interestExpense: null }).interestCover.state).toBe("no-data");
    expect(by({ operatingIncome: null, interestExpense: 10 }).interestCover.state).toBe("no-data");
    expect(by({ operatingIncome: 100, interestExpense: 0 }).interestCover.state).toBe("no-data");
  });

  it("flags short interest at 20% of float or more and keeps null as no data", () => {
    expect(by({ shortInterestPercent: 25 }).shortInterest.state).toBe("flagged");
    expect(by({ shortInterestPercent: 3 }).shortInterest.state).toBe("clear");
    expect(by({ shortInterestPercent: 0 }).shortInterest.state).toBe("clear");
    expect(by({ shortInterestPercent: null }).shortInterest.state).toBe("no-data");
  });
});
