import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEconomicEvents, parseMacroIndicator, parseUstRates, tenorMonths } from "./economy";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/jobs/fixtures/eodhd-flow", name), "utf8")) as unknown;

describe("economy parsers", () => {
  it("reads economic events with vendor times as UTC and keeps change only with an actual", () => {
    const { rows, skipped } = parseEconomicEvents(fixture("events-upcoming.json"));
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(4);
    const inventories = rows.find((row) => row.type === "Business Inventories")!;
    expect(inventories).toMatchObject({ country: "US", comparison: "mom", period: "Sep", eventAt: "2026-11-17T15:00:00.000Z", actual: null, previous: 0.4, estimate: 0.2, change: null, changePct: null });
    expect(inventories.key).toBe("US|Business Inventories|mom|Sep|2026-11-17T15:00:00.000Z");
  });

  it("keeps the change of a released figure and skips rows without required fields", () => {
    const { rows, skipped } = parseEconomicEvents([
      { type: "CPI", comparison: "yoy", period: "Oct", country: "us", date: "2026-11-05", actual: 2.5, previous: 2.6, estimate: null, change: -0.1, change_percentage: -3.8, extra: "ignored" },
      { type: "CPI", country: "USA", date: "2026-11-05" },
      { country: "US", date: "2026-11-05" },
      { type: "GDP", country: "US", date: "2026-13-40 10:00:00" },
      "not an object",
    ]);
    expect(rows).toEqual([expect.objectContaining({ country: "US", eventAt: "2026-11-05T00:00:00.000Z", actual: 2.5, change: -0.1, changePct: -3.8 })]);
    expect(skipped).toBe(4);
    expect(parseEconomicEvents({ error: "x" })).toEqual({ rows: [], skipped: 1 });
  });

  it("reads the live Treasury shapes: bill coupon, long-term rate_type, real-yield tenor", () => {
    const bill = parseUstRates("bill", fixture("ust-bill.json"));
    expect(bill.skipped).toBe(0);
    expect(bill.rows.find((row) => row.date === "2026-11-05" && row.tenor === "52WK")).toMatchObject({ rate: 4.28, raw: expect.objectContaining({ cusip: "912797WT0", discount: 4.09 }) });
    const long = parseUstRates("long-term", fixture("ust-long.json"));
    expect(new Set(long.rows.map((row) => row.tenor))).toEqual(new Set(["BC_20year", "Over_10_Years", "Real_Rate"]));
    const real = parseUstRates("real-yield", fixture("ust-real.json"));
    expect(real.rows.map((row) => row.tenor)).toContain("30Y");
    expect(parseUstRates("yield", { data: [{ date: "2026-01-02", tenor: "1M" }, { date: "2026-01-02", tenor: "2M", rate: "3.7" }] })).toMatchObject({ rows: [{ tenor: "2M", rate: 3.7 }], skipped: 1 });
  });

  it("reads the live macro-indicator field names and the documented lower-case ones", () => {
    const { rows } = parseMacroIndicator("USA", "gdp_growth_annual", fixture("macro-usa.json"));
    expect(rows[0]).toEqual({ country: "USA", indicator: "gdp_growth_annual", date: "2025-12-31", value: 2.1614, countryName: "United States", indicatorName: "GDP growth (annual %)" });
    expect(parseMacroIndicator("DEU", "x", [{ date: "2024-12-31", value: null }]).rows[0]).toMatchObject({ country: "DEU", value: null });
  });

  it("orders tenors by maturity", () => {
    expect(["10Y", "4WK", "6M", "1M", "1.5M", "2Y", "52WK"].sort((a, b) => tenorMonths(a) - tenorMonths(b))).toEqual(["4WK", "1M", "1.5M", "6M", "52WK", "2Y", "10Y"]);
  });
});
