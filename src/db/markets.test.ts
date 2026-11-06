import { describe, expect, it } from "vitest";
import type pg from "pg";
import { assetDetail, assetSummaries, crossMatrix, parseComponents, saveComponents, summarize, vendorSymbolFor } from "./markets";

const fakeDb = (replies: unknown[][], sql: string[] = [], params: unknown[][] = []) => ({ query: async (text: string, values: unknown[]) => {
  sql.push(text); params.push(values);
  return { rows: replies.shift() ?? [] };
} }) as unknown as Pick<pg.Pool, "query">;

describe("market summaries", () => {
  it("computes 1-day, 5-day and year-to-date ratios from ascending closes", () => {
    const out = summarize([100, 101, 102, 103, 104, 105, 110], 88);
    expect(out.last).toBe(110);
    expect(out.change1d).toBeCloseTo(110 / 105 - 1);
    expect(out.change5d).toBeCloseTo(110 / 101 - 1);
    expect(out.changeYtd).toBeCloseTo(110 / 88 - 1);
    expect(summarize([5], null)).toEqual({ last: 5, change1d: null, change5d: null, changeYtd: null });
    expect(summarize([], 1).last).toBeNull();
  });
  it("maps route codes to vendor symbols and rejects anything else", () => {
    expect(vendorSymbolFor("index", "gspc")).toBe("GSPC.INDX");
    expect(vendorSymbolFor("fx", "EURUSD")).toBe("EURUSD.FOREX");
    expect(vendorSymbolFor("crypto", "btc-usd")).toBe("BTC-USD.CC");
    expect(vendorSymbolFor("index", "../etc")).toBeNull();
    expect(vendorSymbolFor("index", "A".repeat(30))).toBeNull();
  });
  it("reads stored rows into summaries and returns nothing without a database", async () => {
    expect(await assetSummaries("index", null)).toEqual([]);
    const sql: string[] = [];
    const rows = await assetSummaries("index", fakeDb([[{ vendor_symbol: "GSPC.INDX", name: "S&P 500 Index", currency: "USD", asset_class: "index", dates: ["2026-11-04", "2026-11-05"], closes: ["100", "101"], ytd_base: "50" }]], sql));
    expect(rows[0]).toMatchObject({ code: "GSPC", last: 101, lastDate: "2026-11-05", changeYtd: 101 / 50 - 1, spark: [100, 101], sparkFirst: "2026-11-04" });
    expect(sql[0]).toContain("LIMIT 30");
    expect(sql[0]).toContain("LIMIT 100");
  });
  it("fills missing OHLC with the close and computes the 52-week range", async () => {
    const detail = await assetDetail("fx", "EURUSD.FOREX", fakeDb([
      [{ vendor_symbol: "EURUSD.FOREX", name: "EUR/USD", currency: "USD", asset_class: "fx", dates: ["2026-11-05"], closes: [1.12], ytd_base: null }],
      [{ bar_date: "2026-11-04", open: "1.1", high: "1.2", low: "1.05", close: "1.15", volume: null }, { bar_date: "2026-11-05", open: null, high: null, low: null, close: "1.12", volume: "5" }],
    ]));
    expect(detail?.bars[1]).toEqual({ date: "2026-11-05", open: 1.12, high: 1.12, low: 1.12, close: 1.12, volume: 5 });
    expect(detail).toMatchObject({ high52: 1.2, low52: 1.05 });
    expect(await assetDetail("fx", "NOPE.FOREX", fakeDb([[]]))).toBeNull();
  });
});

describe("index constituents", () => {
  // Trimmed from the 2026-11-06 GSPC.INDX and GDAXI.INDX fundamentals?filter=Components responses.
  const gspc = { "0": { Code: "AIZ", Exchange: "US", Name: "Assurant, Inc.", Sector: "Financial Services", Industry: "Insurance - Property & Casualty", Weight: 0.0002 },
    "1": { Code: "MNST", Exchange: "US", Name: "Monster Beverage Corp", Sector: "Consumer Defensive", Industry: "Beverages - Non-Alcoholic", Weight: 0.0011 } };
  const gdaxi = { "0": { Code: "RWE", Exchange: "XETRA", Name: "RWE AG", Sector: "Utilities", Industry: "Utilities - Diversified", Weight: null } };
  it("parses the keyed vendor list, keeps null weights and drops bad rows", () => {
    expect(parseComponents(gspc)).toEqual([
      { code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: "Financial Services", industry: "Insurance - Property & Casualty", weight: 0.0002 },
      { code: "MNST", exchange: "US", name: "Monster Beverage Corp", sector: "Consumer Defensive", industry: "Beverages - Non-Alcoholic", weight: 0.0011 },
    ]);
    expect(parseComponents(gdaxi)[0].weight).toBeNull();
    expect(parseComponents({ "0": { Name: "no code" }, "1": { Code: "AIZ" }, "2": { Code: "AIZ" }, "3": null })).toHaveLength(1);
    expect(parseComponents([])).toEqual([]);
    expect(parseComponents(null)).toEqual([]);
  });
  it("upserts one statement per index day, removes departed codes and records the attempt", async () => {
    const sql: string[] = [], params: unknown[][] = [];
    expect(await saveComponents(fakeDb([], sql, params), "GSPC.INDX", "2026-11-08", parseComponents(gspc))).toBe(2);
    expect(sql[0]).toContain("unnest");
    expect(params[0].slice(0, 3)).toEqual(["GSPC.INDX", "2026-11-08", ["AIZ", "MNST"]]);
    expect(params[0].at(-1)).toBe(false);
    expect(sql[1]).toContain("DELETE FROM index_components");
    expect(params[2]).toEqual(["GSPC.INDX", 2, "ok"]);
    const failed: unknown[][] = [];
    await saveComponents(fakeDb([], [], failed), "VIX.INDX", "2026-11-08", null);
    expect(failed).toEqual([["VIX.INDX", 0, "failed"]]);
  });
});

describe("cross rates", () => {
  it("uses direct and inverted pairs, then computes the rest through USD", () => {
    const matrix = crossMatrix([{ code: "EURUSD", last: 1.1 }, { code: "USDJPY", last: 150 }, { code: "GBPUSD", last: 1.3 }, { code: "EURGBP", last: 0.85 }, { code: "XAUUSD", last: null }], ["USD", "EUR", "GBP", "JPY", "CHF"]);
    expect(matrix[0][0]).toEqual({ value: 1, derived: false });
    expect(matrix[1][0]).toEqual({ value: 1.1, derived: false });
    expect(matrix[0][1].value).toBeCloseTo(1 / 1.1);
    expect(matrix[1][2]).toEqual({ value: 0.85, derived: false });
    expect(matrix[1][3].value).toBeCloseTo(165);
    expect(matrix[1][3].derived).toBe(true);
    expect(matrix[2][3].value).toBeCloseTo(195);
    expect(matrix[1][4]).toEqual({ value: null, derived: false });
  });
});
