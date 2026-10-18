import { describe, expect, it } from "vitest";
import { allocate, type AllocationInput, type AllocationSignal } from "./allocation";

const starter = (symbol: string, score = 18): AllocationSignal => ({ symbol, score, asOf: "2026-10-06", action: "START_POSITION", tier: "STARTER" });
const add = (symbol: string, score = 20, high = false): AllocationSignal => ({ symbol, score, asOf: "2026-10-06", action: high ? "HIGH_CONVICTION_ADD" : "ADD", tier: high ? "ADD_HALF" : "ADD_THIRD" });
const input = (changes: Partial<AllocationInput> = {}): AllocationInput => ({ monthlyContributionEur: 200, freeCashEur: 200, portfolioValueEur: 2000, positions: [], signals: [starter("A")], ...changes });

describe("owner monthly allocation", () => {
  it("gives the owner's EUR 200 starter example and keeps an add reserve", () => {
    expect(allocate(input())).toEqual({ suggestions: [{ symbol: "A", tier: "STARTER", amountEur: 40, recycledEur: 0, reason: "TIER_AMOUNT", capped: false }], carriedCashEur: 160, recycledCashEur: 0, reserveEur: 66.67, cashDrag: false });
  });
  it("carries all cash without signals or without an eligible signal", () => {
    expect(allocate(input({ signals: [] })).carriedCashEur).toBe(200);
    const r = allocate(input({ signals: [{ ...starter("A"), tier: "NONE", action: "WATCH" }] }));
    expect(r.suggestions[0]).toMatchObject({ amountEur: 0, reason: "NO_BUY_SIGNAL" });
    expect(r.carriedCashEur).toBe(200);
  });
  it("waits with zero cash", () => {
    expect(allocate(input({ freeCashEur: 0 })).suggestions[0]).toMatchObject({ amountEur: 0, reason: "NO_CASH" });
  });
  it("never passes the same-name portfolio cap, including price drift", () => {
    const r = allocate(input({ portfolioValueEur: 1000, positions: [{ symbol: "A", valueEur: 95 }], signals: [starter("A")] }));
    expect(r.suggestions[0]).toMatchObject({ amountEur: 0, reason: "NAME_CAP", capped: true });
    expect(r.carriedCashEur).toBe(200);
    const partial = allocate(input({ portfolioValueEur: 1000, positions: [{ symbol: "A", valueEur: 60 }] }));
    expect(partial.suggestions[0]).toMatchObject({ amountEur: 40, reason: "TIER_AMOUNT" });
  });
  it("waits below the minimum order and fee threshold", () => {
    const r = allocate(input({ freeCashEur: 30, portfolioValueEur: 1000, monthlyContributionEur: 0 }));
    expect(r.suggestions[0]).toMatchObject({ amountEur: 0, reason: "BELOW_MINIMUM" });
    expect(r.carriedCashEur).toBe(30);
  });
  it("ranks competing signals by score and keeps the reserve", () => {
    const r = allocate(input({ freeCashEur: 120, monthlyContributionEur: 200, signals: [starter("LOW", 16), starter("HIGH", 21)] }));
    expect(r.suggestions.map((s) => [s.symbol, s.amountEur, s.reason])).toEqual([["HIGH", 40, "TIER_AMOUNT"], ["LOW", 0, "RESERVE_LIMIT"]]);
    const enough = allocate(input({ freeCashEur: 150, monthlyContributionEur: 200, signals: [starter("LOW", 16), starter("HIGH", 21)] }));
    expect(enough.suggestions.map((s) => [s.symbol, s.amountEur])).toEqual([["HIGH", 40], ["LOW", 40]]);
  });
  it("lets a high-conviction add use half of free cash only with confirmed add history", () => {
    const signal = add("A", 22, true);
    expect(allocate(input({ signals: [signal], positions: [{ symbol: "A", valueEur: 50 }] })).suggestions[0].reason).toBe("ADD_HISTORY_UNKNOWN");
    const r = allocate(input({ signals: [signal], positions: [{ symbol: "A", valueEur: 50, lastAddMonth: null }] }));
    expect(r.suggestions[0]).toMatchObject({ amountEur: 100, reason: "TIER_AMOUNT" });
  });
  it("blocks another add to the same ticker in the month and duplicate signals", () => {
    const r = allocate(input({ signals: [add("A", 22), add("A", 21)], positions: [{ symbol: "A", valueEur: 50, lastAddMonth: "2026-10" }] }));
    expect(r.suggestions.map((s) => s.reason)).toEqual(["ADD_ALREADY_THIS_MONTH", "DUPLICATE_SIGNAL"]);
    expect(r.carriedCashEur).toBe(200);
  });
  it("shows cash drag without spending to cure it", () => {
    const r = allocate(input({ freeCashEur: 601, signals: [] }));
    expect(r.cashDrag).toBe(true);
    expect(r.carriedCashEur).toBe(601);
  });
  it("allocates recycled cash to sustained profiles before higher-scored event profiles", () => {
    const r = allocate(input({ freeCashEur: 100, recycledCashEur: 70, monthlyContributionEur: 0, portfolioValueEur: 2000,
      signals: [{ ...starter("B", 24), profile: "event" }, { ...starter("A", 18), profile: "sustained" }] }));
    expect(r.suggestions.map((s) => [s.symbol, s.amountEur, s.recycledEur])).toEqual([["A", 40, 40], ["B", 40, 10]]);
    expect(r.recycledCashEur).toBe(20);
    expect(allocate(input({ freeCashEur: 100, recycledCashEur: 70, monthlyContributionEur: 0, portfolioValueEur: 2000,
      signals: [{ ...starter("B", 24), profile: "event" }, { ...starter("A", 18), profile: "sustained" }] }))).toEqual(r);
  });
  it("caps event-driven names at half the ordinary name cap and the sleeve at 20 percent", () => {
    const name = allocate(input({ portfolioValueEur: 1000, monthlyContributionEur: 0, signals: [{ ...starter("B"), profile: "event" }], positions: [{ symbol: "B", valueEur: 40, profile: "event" }] }));
    expect(name.suggestions[0]).toMatchObject({ amountEur: 0, reason: "NAME_CAP" });
    const sleeve = allocate(input({ portfolioValueEur: 1000, monthlyContributionEur: 0, signals: [{ ...starter("B"), profile: "event" }], positions: [{ symbol: "OLD", valueEur: 180, profile: "event" }] }));
    expect(sleeve.suggestions[0]).toMatchObject({ amountEur: 0, reason: "EVENT_SLEEVE_CAP" });
  });
});
