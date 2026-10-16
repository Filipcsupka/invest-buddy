import { describe, expect, it } from "vitest";
import { periodGrain, periodTable, type PeriodSignal } from "./period-table";

const sig = (ticker: string, asOf: string, excess: number | null, tier = "SETUP"): PeriodSignal => ({
  ticker, asOf, tier, windows: { 20: excess === null ? null : { stock: excess + 0.01, spy: 0.01, excess } },
});
const bars = [
  { date: "2026-09-30", close: 100 }, { date: "2026-10-30", close: 103 }, { date: "2026-11-30", close: 99 },
];

describe("periodTable", () => {
  it("groups by month while the log is under a year old", () => {
    expect(periodGrain("2026-10-06", "2027-10-05")).toBe("month");
    expect(periodGrain("2026-10-06", "2027-10-06")).toBe("year");
    const table = periodTable([sig("A", "2026-10-07", 0.04), sig("B", "2026-10-20", -0.02), sig("C", "2026-11-03", 0.01)], bars, "2026-12-01");
    expect(table.grain).toBe("month");
    expect(table.rows.map((r) => r.period)).toEqual(["2026-11", "2026-10"]);
  });

  it("computes n, hit rate and mean excess, and keeps a losing period as a plain row", () => {
    const table = periodTable([sig("A", "2026-10-07", 0.04), sig("B", "2026-10-20", -0.02), sig("C", "2026-11-03", -0.03), sig("D", "2026-11-04", -0.01)], bars, "2026-12-01");
    const [nov, oct] = table.rows;
    expect(oct).toMatchObject({ n: 2, hitRate: 0.5 });
    expect(oct.spyChange).toBeCloseTo(0.03);
    expect(oct.meanExcess).toBeCloseTo(0.01);
    expect(nov).toMatchObject({ n: 2, hitRate: 0 });
    expect(nov.meanExcess).toBeCloseTo(-0.02);
    expect(nov.spyChange).toBeCloseTo(99 / 103 - 1);
    expect(table.spy?.change).toBeCloseTo(-0.01);
    expect(Object.keys(nov)).toEqual(Object.keys(oct));
  });

  it("groups by year once the log is a year old", () => {
    const table = periodTable([sig("A", "2026-10-07", 0.02), sig("B", "2027-10-08", -0.05)], bars, "2027-10-20");
    expect(table.grain).toBe("year");
    expect(table.rows.map((r) => r.period)).toEqual(["2027", "2026"]);
  });

  it("counts pending windows apart, skips BROKEN and de-duplicates ticker and day", () => {
    const table = periodTable([sig("A", "2026-10-07", 0.04), sig("A", "2026-10-07", 0.04), sig("B", "2026-10-08", null), sig("C", "2026-10-09", 0.5, "BROKEN")], bars, "2026-11-01");
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ n: 1, pending: 1, hitRate: 1 });
  });

  it("returns no rows without signals and null SPY without bars", () => {
    expect(periodTable([], bars, "2026-11-01")).toEqual({ grain: "month", rows: [], spy: null });
    const t = periodTable([sig("A", "2026-10-07", 0.04)], [], "2026-11-01");
    expect(t.rows[0].spyChange).toBeNull();
    expect(t.spy).toBeNull();
  });
});
