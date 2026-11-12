import { describe, expect, it } from "vitest";
import {
  atrPercent, buildShortlist, compareShortlist, sectorConcentration, decidingTieBreak, drawdownPercent, percentileRanks, sessionReturn, sessionsUntil, tradedValueUsd,
  type ShortlistBar, type ShortlistInput,
} from "./shortlist";
import { SHORTLIST_CONFIG } from "./shortlist-config";

const ASOF = "2026-11-10";
/** `n` bars rising from `start` to `end`, flat volume, high/low 1% around the close. */
function bars(n: number, start: number, end: number, volume = 1_000_000): ShortlistBar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + (end - start) * (n === 1 ? 1 : i / (n - 1));
    return { close, high: close * 1.01, low: close * 0.99, volume };
  });
}
function input(ticker: string, over: Partial<ShortlistInput> = {}): ShortlistInput {
  return { ticker, displayState: "setup", percent: 80, evidencedPoints: 23, bars: bars(64, 50, 100), currency: "USD", reportDate: null, sector: "Technology", ...over };
}
/** A universe of weak names so the candidates rank high on relative strength. */
const field = Array.from({ length: 20 }, (_, i) => input(`W${String(i).padStart(2, "0")}`, { displayState: "wait", bars: bars(64, 100, 90 + i) }));

describe("bar metrics", () => {
  it("measures the session return and needs one bar more than the window", () => {
    expect(sessionReturn(bars(64, 50, 100), 63)).toBe(100);
    expect(sessionReturn(bars(63, 50, 100), 63)).toBeNull();
    expect(sessionReturn([...bars(63, 50, 100), { close: Number.NaN, high: 1, low: 1, volume: 1 }], 63)).toBeNull();
  });
  it("measures ATR in percent of the last close", () => {
    const flat = Array.from({ length: 15 }, () => ({ close: 100, high: 101, low: 99, volume: 1 }));
    expect(atrPercent(flat, 14)).toBe(2);
    expect(atrPercent(flat.slice(1), 14)).toBeNull();
  });
  it("measures the drawdown from the window high", () => {
    const down = [...bars(10, 100, 100), { close: 70, high: 71, low: 69, volume: 1 }];
    expect(drawdownPercent(down, 63)).toBeCloseTo(30.69, 2);
    expect(drawdownPercent([], 63)).toBeNull();
  });
  it("counts traded value only for USD quotes", () => {
    const b = bars(20, 10, 10, 300_000);
    expect(tradedValueUsd(b, "USD", 20)).toBe(3_000_000);
    expect(tradedValueUsd(b, "usd", 20)).toBe(3_000_000);
    expect(tradedValueUsd(b, "GBX", 20)).toBeNull();
    expect(tradedValueUsd(b, "EUR", 20)).toBeNull();
    expect(tradedValueUsd(b, null, 20)).toBeNull();
    expect(tradedValueUsd(b.slice(1), "USD", 20)).toBeNull();
  });
  it("counts NYSE sessions to the report date", () => {
    expect(sessionsUntil("2026-11-10", "2026-11-10")).toBe(0);
    expect(sessionsUntil("2026-11-10", "2026-11-17")).toBe(5);
    // Thanksgiving 2026-11-26 is not a session.
    expect(sessionsUntil("2026-11-24", "2026-11-30")).toBe(3);
    expect(sessionsUntil("2026-11-10", "2026-11-09")).toBeNull();
    expect(sessionsUntil("2026-11-10", null)).toBeNull();
    expect(sessionsUntil("2027-12-30", "2028-01-05")).toBeNull();
    // A same-day report is checked against the calendar too.
    expect(sessionsUntil("2028-01-05", "2028-01-05")).toBeNull();
    expect(sessionsUntil("2026-11-10", "2026-11-1")).toBeNull();
    expect(sessionsUntil("2026-11-10", "2026-13-40")).toBeNull();
  });
  it("ranks percentiles among known values only", () => {
    const ranks = percentileRanks(new Map<string, number | null>([["A", 1], ["B", 2], ["C", 3], ["D", null]]));
    expect(Object.fromEntries(ranks)).toEqual({ A: 0, B: 50, C: 100, D: null });
    expect(percentileRanks(new Map([["A", 1]])).get("A")).toBeNull();
    const ties = percentileRanks(new Map<string, number | null>([["A", 1], ["B", 2], ["C", 2], ["D", 3]]));
    expect(Object.fromEntries(ties)).toEqual({ A: 0, B: 67, C: 67, D: 100 });
  });
});

describe("gates", () => {
  const check = (ticker: string, list: ReturnType<typeof buildShortlist>) => [...list.kept, ...list.dropped].find((row) => row.ticker === ticker)!;

  it("only takes displayed Setup met names as candidates", () => {
    const list = buildShortlist(ASOF, [...field, input("GOOD")]);
    expect(list.candidates).toBe(1);
    expect(list.kept.map((row) => row.ticker)).toEqual(["GOOD"]);
  });

  it("F1 drops thin evidence, keeps the boundary and marks unknown evidence", () => {
    const list = buildShortlist(ASOF, [...field, input("AT", { evidencedPoints: 23 }), input("LOW", { evidencedPoints: 22 }), input("UNK", { evidencedPoints: null })]);
    expect(check("AT", list).checks[0]).toMatchObject({ gate: "F1", status: "pass", reason: "EVIDENCE_OK" });
    expect(check("LOW", list)).toMatchObject({ kept: false, dropReasons: ["EVIDENCE_LOW"] });
    expect(check("UNK", list)).toMatchObject({ kept: true, notAssessed: ["evidence", "report"] });
    expect(list.gates.F1).toEqual({ pass: 1, fail: 1, notAssessed: 1 });
  });

  it("F2 drops a laggard and a thin listing, and never fails unknown liquidity", () => {
    const list = buildShortlist(ASOF, [...field,
      input("LEAD"),
      input("LAG", { bars: bars(64, 100, 91) }),
      input("THIN", { bars: bars(64, 50, 100, 100) }),
      input("LSE", { currency: "GBX" }),
      input("NEW", { bars: bars(30, 50, 100) }),
    ]);
    expect(check("LEAD", list)).toMatchObject({ kept: true, notAssessed: ["report"] });
    expect(check("LAG", list)).toMatchObject({ kept: false, dropReasons: ["RS_LOW"] });
    expect(check("THIN", list)).toMatchObject({ kept: false, dropReasons: ["LIQUIDITY_LOW"] });
    expect(check("LSE", list)).toMatchObject({ kept: true, tradedValueUsd: null });
    expect(check("LSE", list).notAssessed).toContain("liquidity");
    expect(check("NEW", list)).toMatchObject({ kept: true, rsPercentile: null });
    expect(check("NEW", list).notAssessed).toContain("rs");
  });

  it("F3 flags but never drops", () => {
    const deep = [...bars(60, 50, 130), ...bars(4, 95, 95)];
    const list = buildShortlist(ASOF, [...field,
      input("SOON", { reportDate: "2026-11-17" }),
      input("LATER", { reportDate: "2026-11-18" }),
      input("STALE", { reportDate: "2026-11-12", reportStale: true }),
      input("DEEP", { bars: deep }),
    ]);
    expect(check("SOON", list)).toMatchObject({ kept: true, flags: ["REPORT_SOON"], reportSessions: 5 });
    expect(check("LATER", list)).toMatchObject({ kept: true, flags: [], reportSessions: 6 });
    expect(check("STALE", list).notAssessed).toContain("report");
    expect(check("DEEP", list).flags).toContain("DRAWDOWN_DEEP");
    expect(check("DEEP", list).kept).toBe(true);
    expect(list.survivors.flaggedF3).toBe(2);
  });

  it("counts survivors per gate", () => {
    const list = buildShortlist(ASOF, [...field, input("A"), input("B", { evidencedPoints: 20 }), input("C", { bars: bars(64, 100, 91) })]);
    expect(list.survivors).toEqual({ afterF1: 2, afterF2: 1, flaggedF3: 0 });
    expect(list.dropped.map((row) => row.ticker)).toEqual(["B", "C"]);
    expect(list.dropped.every((row) => row.rank === null && row.decidedBy === null)).toBe(true);
  });

  it("uses the configured thresholds", () => {
    const list = buildShortlist(ASOF, [...field, input("B", { evidencedPoints: 20 })], { ...SHORTLIST_CONFIG, minEvidencedPoints: 20 });
    expect(list.kept.map((row) => row.ticker)).toEqual(["B"]);
  });

  it("rejects a malformed asOf", () => {
    expect(() => buildShortlist("10.11.2026", [])).toThrow("Invalid asOf");
  });
});

describe("ranking", () => {
  const base = { ticker: "X", percent: 80, evidencedPoints: 23, rsPercentile: 90, atrPercent: 3, tradedValueUsd: 5_000_000 };
  it("orders by percent, coverage, RS, lower ATR, higher traded value, ticker", () => {
    const rows = [
      { ...base, ticker: "F" },
      { ...base, ticker: "E", tradedValueUsd: 9_000_000 },
      { ...base, ticker: "D", atrPercent: 2 },
      { ...base, ticker: "C", rsPercentile: 95 },
      { ...base, ticker: "B", evidencedPoints: 25 },
      { ...base, ticker: "A", percent: 90 },
      { ...base, ticker: "G" },
    ];
    const sorted = [...rows].sort(compareShortlist);
    expect(sorted.map((row) => row.ticker)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(sorted.slice(1).map((row, i) => decidingTieBreak(sorted[i], row))).toEqual(["percent", "coverage", "rs", "atr", "tradedValue", "ticker"]);
  });
  it("puts unknown tie-breaker values last", () => {
    const sorted = [{ ...base, ticker: "A", rsPercentile: null }, { ...base, ticker: "B" }, { ...base, ticker: "C", atrPercent: null, rsPercentile: null }].sort(compareShortlist);
    expect(sorted.map((row) => row.ticker)).toEqual(["B", "A", "C"]);
  });
  it("ranks kept names and records the deciding tie-breaker", () => {
    const list = buildShortlist(ASOF, [...field, input("B"), input("A"), input("TOP", { percent: 95 })]);
    expect(list.kept.map((row) => [row.ticker, row.rank, row.decidedBy])).toEqual([["TOP", 1, null], ["A", 2, "percent"], ["B", 3, "ticker"]]);
  });
  it("is deterministic for any input order", () => {
    const names = [input("B"), input("A", { percent: 75 }), input("C", { evidencedPoints: 25 })];
    const one = buildShortlist(ASOF, [...field, ...names]).kept.map((row) => row.ticker);
    const two = buildShortlist(ASOF, [...names].reverse().concat(field)).kept.map((row) => row.ticker);
    expect(one).toEqual(two);
    expect(one).toEqual(["C", "B", "A"]);
  });
});

describe("sector concentration", () => {
  const row = (ticker: string, sector: ShortlistInput["sector"]) => ({ ticker, sector });
  it("counts names per group, largest first, Unknown last", () => {
    const lens = sectorConcentration([row("A", "Technology"), row("B", "Unknown"), row("C", "Unknown"), row("D", "Unknown"), row("E", "Healthcare"), row("F", "Technology")]);
    expect(lens.groups.map((g) => [g.sector, g.count, g.sharePercent, g.flagged])).toEqual([
      ["Technology", 2, 33.3, true], ["Healthcare", 1, 16.7, false], ["Unknown", 3, 50, false],
    ]);
    expect(lens.unknownCount).toBe(3);
    expect(lens.groups[0].tickers).toEqual(["A", "F"]);
  });
  it("flags only a share above the threshold", () => {
    const ten = Array.from({ length: 10 }, (_, i) => row(`T${i}`, i < 3 ? "Technology" : "Energy"));
    const lens = sectorConcentration(ten);
    expect(lens.groups.find((g) => g.sector === "Technology")).toMatchObject({ sharePercent: 30, flagged: false });
    expect(lens.groups.find((g) => g.sector === "Energy")).toMatchObject({ sharePercent: 70, flagged: true });
    expect(sectorConcentration(ten, { sectorShareFlagPercent: 25 }).groups.every((g) => g.flagged)).toBe(true);
  });
  it("handles an empty list", () => {
    expect(sectorConcentration([])).toEqual({ total: 0, thresholdPercent: 30, groups: [], unknownCount: 0 });
  });
});

describe("unrounded metrics", () => {
  it("returns raw values so near ties are not merged", () => {
    expect(sessionReturn([{ close: 3, high: 3, low: 3, volume: 1 }, { close: 3.001, high: 3, low: 3, volume: 1 }], 1)).toBeCloseTo(0.0333, 4);
    const flat = Array.from({ length: 15 }, () => ({ close: 300, high: 301.01, low: 299, volume: 1 }));
    expect(atrPercent(flat, 14)).toBeCloseTo(0.67, 2);
  });

  it("ranks relative strength on unrounded returns", () => {
    // 100.04% and 100.01% both round to 100.0%; the leader must still rank above the other.
    const close = (start: number, end: number) => Array.from({ length: 64 }, (_, i) => ({ close: i === 63 ? end : start, high: end, low: start, volume: 1_000_000 }));
    const list = buildShortlist(ASOF, [input("HI", { bars: close(50, 100.02) }), input("LO", { bars: close(50, 100.005) }), ...Array.from({ length: 3 }, (_, i) => input(`F${i}`, { displayState: "wait", bars: close(50, 60) }))]);
    const hi = list.kept.find((row) => row.ticker === "HI")!, lo = [...list.kept, ...list.dropped].find((row) => row.ticker === "LO")!;
    expect(hi.rsPercentile!).toBeGreaterThan(lo.rsPercentile!);
  });

  it("breaks ties on unrounded ATR", () => {
    const base = { ticker: "X", percent: 80, evidencedPoints: 23, rsPercentile: 90, tradedValueUsd: 5_000_000 };
    const sorted = [{ ...base, ticker: "A", atrPercent: 2.04 }, { ...base, ticker: "B", atrPercent: 2.01 }].sort(compareShortlist);
    expect(sorted.map((row) => row.ticker)).toEqual(["B", "A"]);
    expect(decidingTieBreak(sorted[0], sorted[1])).toBe("atr");
  });

  it("flags a drawdown just over 25% even when it rounds to 25.0%", () => {
    // Last close 74.98 under a high of 100: 25.02% down, shown as 25.0%.
    const b = [...Array.from({ length: 63 }, () => ({ close: 100, high: 100, low: 99, volume: 1_000_000 })), { close: 74.98, high: 75, low: 74, volume: 1_000_000 }];
    expect(drawdownPercent(b, 63)).toBeGreaterThan(25);
    const row = buildShortlist(ASOF, [input("DD", { bars: b })]);
    expect([...row.kept, ...row.dropped][0].flags).toContain("DRAWDOWN_DEEP");
    const exact = [...b.slice(0, 63), { close: 75, high: 75, low: 74, volume: 1_000_000 }];
    expect([...buildShortlist(ASOF, [input("EQ", { bars: exact })]).kept, ...buildShortlist(ASOF, [input("EQ", { bars: exact })]).dropped][0].flags).not.toContain("DRAWDOWN_DEEP");
  });
});
