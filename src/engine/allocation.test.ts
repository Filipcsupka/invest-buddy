import { describe, expect, it } from "vitest";
import { allocate, type AllocationInput, type AllocationSignal } from "./allocation";

const starter = (symbol: string, score = 18): AllocationSignal => ({ symbol, score, asOf: "2026-10-06", action: "START_POSITION", tier: "STARTER" });
const add = (symbol: string, score = 20, high = false): AllocationSignal => ({ symbol, score, asOf: "2026-10-06", action: high ? "HIGH_CONVICTION_ADD" : "ADD", tier: high ? "ADD_HALF" : "ADD_THIRD" });
const input = (changes: Partial<AllocationInput> = {}): AllocationInput => ({ monthlyContributionEur: 200, freeCashEur: 200, portfolioValueEur: 2000, positions: [], signals: [starter("A")], ...changes });

describe("owner monthly allocation", () => {
  it("gives the owner's EUR 200 starter example and keeps an add reserve", () => {
    expect(allocate(input())).toEqual({ suggestions: [{ symbol: "A", tier: "STARTER", amountEur: 40, recycledEur: 0, reason: "TIER_AMOUNT", capped: false, sectorChecked: false }], carriedCashEur: 160, recycledCashEur: 0, reserveEur: 66.67, cashDrag: false, overLimit: [] });
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

describe("sector cap and position count", () => {
  const held = (symbol: string, valueEur: number, sector: string | null = "Technology") => ({ symbol, valueEur, sector });
  const tech = (symbol: string, score = 18): AllocationSignal => ({ ...starter(symbol, score), sector: "Technology" });

  it("blocks a new name when its sector is at the cap of total value including cash", () => {
    // 30% of EUR 2,000 is EUR 600; EUR 600 of Technology is already held.
    const r = allocate(input({ positions: [held("H1", 300), held("H2", 300)], signals: [tech("A")] }));
    expect(r.suggestions[0]).toMatchObject({ symbol: "A", amountEur: 0, reason: "SECTOR_CAP", capped: true, sectorChecked: true });
    expect(r.carriedCashEur).toBe(200);
  });

  it("trims to the room left in the sector", () => {
    const r = allocate(input({ freeCashEur: 1000, monthlyContributionEur: 0, positions: [held("H1", 550)], signals: [tech("A")] }));
    expect(r.suggestions[0]).toMatchObject({ amountEur: 50, reason: "SECTOR_CAP", capped: true });
    // Less room than the minimum order waits instead of placing a tiny order.
    const tiny = allocate(input({ freeCashEur: 1000, monthlyContributionEur: 0, positions: [held("H1", 570)], signals: [tech("A")] }));
    expect(tiny.suggestions[0]).toMatchObject({ amountEur: 0, reason: "SECTOR_CAP" });
  });

  it("counts amounts assigned earlier in the same run against the sector", () => {
    const r = allocate(input({ freeCashEur: 1000, monthlyContributionEur: 0, portfolioValueEur: 2000, positions: [held("H1", 500)], signals: [tech("A", 20), tech("B", 19)] }));
    expect(r.suggestions.map((s) => [s.symbol, s.amountEur, s.reason])).toEqual([["A", 70, "ORDER_CEILING"], ["B", 0, "SECTOR_CAP"]]);
  });

  it("uses the holding's sector over the signal's and skips the check when the sector is unknown", () => {
    const fromHolding = allocate(input({ positions: [held("H1", 600), { symbol: "A", valueEur: 10, sector: "Technology" }], signals: [{ ...starter("A"), sector: "Energy" }] }));
    expect(fromHolding.suggestions[0]).toMatchObject({ reason: "SECTOR_CAP", sectorChecked: true });
    const unknown = allocate(input({ positions: [held("H1", 600)], signals: [{ ...starter("A"), sector: "Unknown" }] }));
    expect(unknown.suggestions[0]).toMatchObject({ amountEur: 40, reason: "TIER_AMOUNT", sectorChecked: false });
  });

  it("stops new names at the position limit but still allows adds to held names", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => held(`P${i}`, 50, null));
    const r = allocate(input({ freeCashEur: 400, positions: [...fifteen.slice(0, 14), { ...fifteen[14], lastAddMonth: null }], signals: [starter("NEW"), add("P14")] }));
    expect(r.suggestions.find((s) => s.symbol === "NEW")).toMatchObject({ amountEur: 0, reason: "MAX_POSITIONS" });
    expect(r.suggestions.find((s) => s.symbol === "P14")!.amountEur).toBeGreaterThan(0);
  });

  it("counts positions opened in the same run", () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => held(`P${i}`, 50, null));
    const r = allocate(input({ freeCashEur: 400, monthlyContributionEur: 0, positions: fourteen, signals: [starter("A", 20), starter("B", 19)] }));
    expect(r.suggestions.map((s) => [s.symbol, s.amountEur > 0, s.reason])).toEqual([["A", true, "ORDER_CEILING"], ["B", false, "MAX_POSITIONS"]]);
  });

  it("reports holdings already over a limit and never assigns a negative amount", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => held(`P${i}`, 50, i < 14 ? "Technology" : "Energy"));
    const r = allocate(input({ portfolioValueEur: 2000, positions: [...sixteen, held("BIG", 300, "Healthcare")], signals: [tech("A")] }));
    expect(r.overLimit).toEqual([
      { kind: "SECTOR_CAP", key: "Technology", value: 35, limit: 30 },
      { kind: "NAME_CAP", key: "BIG", value: 15, limit: 10 },
      { kind: "MAX_POSITIONS", key: "positions", value: 17, limit: 15 },
    ]);
    expect(r.suggestions[0]).toMatchObject({ amountEur: 0, reason: "MAX_POSITIONS" });
    expect(r.suggestions.every((s) => s.amountEur >= 0)).toBe(true);
  });
});
