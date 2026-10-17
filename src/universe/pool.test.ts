import { describe, expect, it } from "vitest";
import { poolCsv, rankPool } from "./pool";
import type { Growth } from "../collectors/sources/frames";

const g = (cik: number, yoy: number, prior: number, revenue = 100_000_000): Growth => ({ cik, name: `Co ${cik}`, concept: "Revenues", end: "2026-06-30", revenue, yoyPercent: yoy, qoqPercent: 5, priorYoyPercent: prior, accelerationPp: yoy - prior });
const tickers = new Map([[1, "AAA"], [2, "BBB"], [3, "CCC"], [4, "DDD"], [5, "EEE"]]);

describe("rankPool", () => {
  it("ranks by the weaker of the two growth rates so a one-quarter spike does not lead", () => {
    const rows = rankPool([g(1, 900, 12), g(2, 60, 55), g(3, 40, 45)], tickers, new Set(), { minYoy: 15, size: 10 });
    expect(rows.map((r) => r.ticker)).toEqual(["BBB", "CCC", "AAA"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  it("drops held names, small revenue, weak prior growth and unmapped CIKs", () => {
    const rows = rankPool([g(1, 50, 50), g(2, 50, 50), g(3, 50, 50, 10_000_000), g(4, 50, 2), g(99, 50, 50)], tickers, new Set(["AAA"]), { minYoy: 15, size: 10 });
    expect(rows.map((r) => r.ticker)).toEqual(["BBB"]);
  });
  it("caps the pool at size", () => {
    expect(rankPool([g(1, 50, 50), g(2, 40, 40), g(3, 30, 30)], tickers, new Set(), { minYoy: 15, size: 2 })).toHaveLength(2);
  });
});

describe("poolCsv", () => {
  it("quotes names with commas and quotes", () => {
    const rows = rankPool([{ ...g(1, 50, 50), name: 'A, "B" Inc' }], tickers, new Set(), { minYoy: 15, size: 1 });
    expect(poolCsv(rows).split("\n")[1]).toContain('"A, ""B"" Inc"');
  });
});
