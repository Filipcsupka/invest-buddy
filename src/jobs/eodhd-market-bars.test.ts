import { expect, it } from "vitest";
import type pg from "pg";
import { parseMarketBarsArgs, runMarketBars } from "./eodhd-market-bars";

it("parses a bounded backfill and asset class", () => {
  expect(parseMarketBarsArgs([])).toEqual({ dryRun: false, backfill: 5 });
  expect(parseMarketBarsArgs(["--class", "fx", "--dry-run", "--backfill", "2"])).toEqual({ assetClass: "fx", dryRun: true, backfill: 2 });
  expect(() => parseMarketBarsArgs(["--class", "stock"])).toThrow();
  expect(() => parseMarketBarsArgs(["--backfill", "31"])).toThrow();
});

it("starts after the last stored day, upserts valid bars and logs billed attempts", async () => {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const db = { query: async (text: string, values: unknown[]) => {
    sql.push(text); params.push(values);
    return { rows: sql.length === 1 ? [{ vendor_symbol: "GSPC.INDX", asset_class: "index", currency: "USD", last_bar_date: "2026-11-04" }] : [] };
  } } as unknown as Pick<pg.Pool, "query">;
  const fetched: { symbol: string; from?: string; to?: string }[] = [];
  const api = { eod: async (symbol: string, options: { from?: string; to?: string }) => {
    fetched.push({ symbol, ...options });
    return [{ date: "2026-11-05", open: 10, high: 12, low: 9, close: 11, volume: 100 }];
  }, getCallCosts: () => ({ eod: 1 }) };
  const result = await runMarketBars(db, api, { assetClass: "index", dryRun: false, backfill: 5 }, "2026-11-05");
  expect(fetched).toEqual([{ symbol: "GSPC.INDX", from: "2026-11-05", to: "2026-11-05" }]);
  expect(result).toMatchObject({ assets: 1, refreshed: 1, rows: 1, calls: 1, failures: 0 });
  expect(sql[1]).toContain("ON CONFLICT (vendor_symbol,bar_date) DO UPDATE");
  expect(params[1].at(-1)).toBe(false);
  expect(sql[2]).toContain("eodhd_call_log");
  expect(params[2]).toEqual(["eodhd-market-bars", 1]);
});
