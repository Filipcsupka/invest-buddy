import { describe, expect, it } from "vitest";
import type pg from "pg";
import fixture from "../data-providers/eodhd/fixtures/markets/market-cap.json";
import { marketCapSeries, parseMarketCap, saveMarketCap } from "./market-cap";

describe("market cap history", () => {
  it("parses the vendor's keyed object into ascending unique points", () => {
    expect(parseMarketCap(fixture)).toEqual([{ date: "2026-10-30", value: 4000000000000 }]);
    expect(parseMarketCap({ "1": { date: "2026-10-30", value: 2 }, "0": { date: "2026-10-23", value: "1" }, "2": { date: "bad", value: 3 }, "3": { date: "2026-10-16", value: -1 }, "4": { date: "2026-10-30", value: 5 } }))
      .toEqual([{ date: "2026-10-23", value: 1 }, { date: "2026-10-30", value: 5 }]);
    expect(parseMarketCap([])).toEqual([]);
    expect(parseMarketCap(null)).toEqual([]);
  });
  it("upserts the series in one statement and records the attempt", async () => {
    const sql: string[] = [], params: unknown[][] = [];
    const db = { query: async (text: string, values: unknown[]) => { sql.push(text); params.push(values); return { rows: [] }; } } as unknown as Pick<pg.Pool, "query">;
    expect(await saveMarketCap(db, { ticker: "AAPL", vendorSymbol: "AAPL.US" }, [{ date: "2026-10-23", value: 1 }, { date: "2026-10-30", value: 2 }])).toBe(2);
    expect(sql[0]).toContain("unnest");
    expect(params[0]).toEqual(["AAPL.US", ["2026-10-23", "2026-10-30"], [1, 2], false]);
    expect(params[1]).toEqual(["AAPL.US", "AAPL", "2026-10-30", "ok"]);
    await saveMarketCap(db, { ticker: "AAPL", vendorSymbol: "AAPL.US" }, null);
    expect(params.at(-1)).toEqual(["AAPL.US", "AAPL", null, "failed"]);
  });
  it("reads nothing without a database", async () => {
    expect(await marketCapSeries("AAPL", null)).toEqual([]);
  });
});
