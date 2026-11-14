import { describe, expect, it } from "vitest";
import type pg from "pg";
import { EodhdHttpError } from "../data-providers/eodhd/client";
import spy from "./fixtures/eodhd-etf/spy-etf.json";
import spyDividends from "./fixtures/eodhd-etf/spy-div.json";
import iwdaBars from "./fixtures/eodhd-etf/iwda-eod.json";
import { ETF_DETAIL_FILTER, etfJobName, missedWeekday, parseEtfJobArgs, runEtfJob, splitAdjust, suspectSplit } from "./eodhd-etf";

type Due = { listing_key: string; vendor_symbol: string; isin: string | null; currency: string | null; exchange: string; detail_fresh: boolean; last_bar_date: string | null; last_close: number | null; last_dividend_date: string | null };
const row = (over: Partial<Due> = {}): Due => ({ listing_key: "NYSEARCA:SPY", vendor_symbol: "SPY.US", isin: "US78462F1030", currency: "USD", exchange: "US", detail_fresh: false, last_bar_date: null, last_close: null, last_dividend_date: null, ...over });
function fakeDb(due: Due[], candidates = due.length, callsToday: number | { job: string; calls: number }[] = 0) {
  const writes: string[] = []; const selects: string[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("WITH resolved AS")) return { rows: Array.from({ length: candidates }, (_, i) => ({ listing_key: `K${i}`, vendor_symbol: `E${i}.US`, name: `Fund ${i}`, currency: "USD", exchange: "US", rank: i + 1 })) };
    if (sql.includes("FROM eodhd_call_log WHERE run_date")) return { rows: [{ calls: String(Array.isArray(callsToday) ? callsToday.reduce((sum, row) => sum + row.calls, 0) : callsToday) }] };
    if (sql.includes("count(*)::text AS n FROM etf_tracked")) return { rows: [{ n: String(due.length) }] };
    if (sql.includes("FROM etf_tracked t JOIN etf_catalog")) { selects.push(String(params[0])); return { rows: due.slice(0, Number(params[1]) || due.length) }; }
    if (/^\s*(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/.test(sql)) writes.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
    return { rows: [], rowCount: 0 };
  };
  return { db: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool, writes, selects };
}
type BulkRow = { code: string; date: string; open: number; high: number; low: number; close: number; volume: number };
const bulkRow = (code: string, date = "2026-11-06"): BulkRow => ({ code, date, open: 100, high: 102, low: 99, close: 101, volume: 1000 });
const usFunds = (n: number, last = "2026-11-05") => Array.from({ length: n }, (_, i) => row({ listing_key: `F${i}`, vendor_symbol: `F${i}.US`, last_bar_date: last }));
function fakeApi(override: { fundamentals?: Error; bulk?: Error; bulkRows?: BulkRow[]; eodRows?: typeof iwdaBars; splits?: { date: string; split: string }[] } = {}) {
  const costs = { fundamentals: 0, dividends: 0, eod: 0, splits: 0, "eod-bulk-last-day": 0 }; const seen: string[] = [];
  return { seen, api: {
    fundamentals: async <T,>(symbol: string, filter?: string) => { costs.fundamentals += 10; seen.push(`f:${symbol}:${filter}`); if (override.fundamentals) throw override.fundamentals; return spy as T; },
    dividends: async (symbol: string, opts: { from?: string }) => { costs.dividends++; seen.push(`d:${symbol}:${opts.from}`); return spyDividends; },
    eod: async (symbol: string, opts: { from?: string }) => { costs.eod++; seen.push(`e:${symbol}:${opts.from}`); return override.eodRows ?? iwdaBars; },
    splits: async (symbol: string, opts: { from?: string }) => { costs.splits++; seen.push(`s:${symbol}:${opts.from}`); return override.splits ?? []; },
    eodBulkLastDay: async (exchange: string) => { costs["eod-bulk-last-day"] += 100; seen.push(`bulk:${exchange}`); if (override.bulk) throw override.bulk; return override.bulkRows ?? []; },
    getCallCosts: () => ({ ...costs }),
  } };
}

it("parses independent modes, all tracked by default and a bounded call cap", () => {
  expect(parseEtfJobArgs([], {})).toEqual({ mode: "bars", dryRun: false, maxTracked: 0, maxCalls: 10000, accountBudget: 70000, backfill: 5, limit: 0 });
  expect(() => parseEtfJobArgs([], { EODHD_ACCOUNT_DAILY_BUDGET: "100001" })).toThrow();
  expect(parseEtfJobArgs(["--mode", "backfill", "--limit", "500"], { ETF_MAX_TRACKED: "7000", ETF_EODHD_MAX_CALLS: "8000" })).toMatchObject({ mode: "backfill", limit: 500, maxTracked: 7000, maxCalls: 8000 });
  expect(() => parseEtfJobArgs(["--mode", "wrong"], {})).toThrow();
  expect(() => parseEtfJobArgs(["--max-calls", "0"], {})).toThrow();
});

describe("runEtfJob", () => {
  it("dry run only reads and estimates bulk calls", async () => {
    const { db, writes } = fakeDb([row(), row({ listing_key: "AS:IWDA", vendor_symbol: "IWDA.AS", exchange: "AS" })]);
    const result = await runEtfJob(db, null, parseEtfJobArgs(["--dry-run"], {}), "2026-11-06");
    // Two exchanges with one fund each: per-symbol requests cost less than two bulk files.
    expect(result).toMatchObject({ due: 2, estimatedCalls: 2, calls: 0 });
    expect(writes).toEqual([]);
  });

  it("daily bars use one bulk call for a large exchange and fall back only for a missing symbol", async () => {
    const due = [...usFunds(99), row({ listing_key: "X", vendor_symbol: "X.US", last_bar_date: "2026-11-05" })];
    const { db, writes, selects } = fakeDb(due); const { api, seen } = fakeApi({ bulkRows: due.slice(0, 99).map((fund) => bulkRow(fund.vendor_symbol.split(".")[0])) });
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "bars", "--max-calls", "101"], {}), "2026-11-06");
    expect(selects).toEqual(["bars"]);
    expect(seen).toEqual(["bulk:US", "e:X.US:2026-11-06"]);
    expect(result).toMatchObject({ bulkExchanges: 1, processed: 100, bars: 102, calls: 101, failures: 0, deferred: 0 });
    expect(writes).not.toContain("INSERT INTO etf_fund_stats");
  });

  it("daily bars request a small exchange per symbol and skip the bulk file", async () => {
    const due = [row({ vendor_symbol: "IWDA.AS", exchange: "AS", last_bar_date: "2026-11-05" }), row({ listing_key: "AS:NEW", vendor_symbol: "NEW.AS", exchange: "AS" })];
    const { db } = fakeDb(due); const { api, seen } = fakeApi();
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "bars"], {}), "2026-11-06");
    expect(seen).toEqual(["e:IWDA.AS:2026-11-06", "e:NEW.AS:2026-10-23"]);
    expect(result).toMatchObject({ bulkExchanges: 0, processed: 2, calls: 2 });
  });

  it("daily bars fill a missed weekday per symbol and stop before the cap", async () => {
    const due = [row({ listing_key: "GAP", vendor_symbol: "GAP.US", last_bar_date: "2026-11-03" }), ...usFunds(99), row({ listing_key: "Z", vendor_symbol: "Z.US", last_bar_date: "2026-11-03" })];
    const { db } = fakeDb(due); const { api, seen } = fakeApi({ bulkRows: due.map((fund) => bulkRow(fund.vendor_symbol.split(".")[0])) });
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "bars", "--max-calls", "101"], {}), "2026-11-06");
    expect(seen).toEqual(["bulk:US", "e:GAP.US:2026-11-04"]);
    expect(result).toMatchObject({ processed: 100, deferred: 1, calls: 101 });
  });

  it("restates history after a vendor-confirmed split and ignores a jump the vendor does not confirm", async () => {
    const fund = row({ listing_key: "AS:IWDA", vendor_symbol: "IWDA.AS", exchange: "AS", last_bar_date: "2026-10-26", last_close: 527 });
    const split = fakeApi({ splits: [{ date: "2026-10-27", split: "4.000000/1.000000" }] });
    const result = await runEtfJob(fakeDb([fund]).db, split.api, parseEtfJobArgs(["--mode", "bars"], {}), "2026-11-06");
    expect(split.seen).toEqual(["e:IWDA.AS:2026-10-27", "s:IWDA.AS:2021-11-06", "e:IWDA.AS:2021-11-06"]);
    expect(result).toMatchObject({ splitChecks: 1, splitAdjusted: 1, bars: 3, calls: 3 });
    const none = fakeApi();
    const plain = await runEtfJob(fakeDb([fund]).db, none.api, parseEtfJobArgs(["--mode", "bars"], {}), "2026-11-06");
    expect(none.seen).toEqual(["e:IWDA.AS:2026-10-27", "s:IWDA.AS:2021-11-06"]);
    expect(plain).toMatchObject({ splitChecks: 1, splitAdjusted: 0, calls: 2 });
  });

  it("detects split-sized jumps and divides earlier prices by the split ratio", () => {
    expect(suspectSplit(100, [{ date: "2026-11-06", close: 50 }])).toBe(true);
    expect(suspectSplit(100, [{ date: "2026-11-06", close: 80 }])).toBe(false);
    expect(suspectSplit(null, [{ date: "2026-11-05", close: 30 }, { date: "2026-11-06", close: 100 }])).toBe(true);
    const bars = [{ date: "2026-11-04", open: 200, high: 210, low: 190, close: 200, volume: 10 }, { date: "2026-11-05", open: 100, high: 105, low: 95, close: 100, volume: 10 }];
    expect(splitAdjust(bars, [{ date: "2026-11-05", split: "2.000000/1.000000" }])[0]).toMatchObject({ open: 100, high: 105, low: 95, close: 100, volume: 10 });
    expect(splitAdjust(bars, [{ date: "2026-11-05", split: "bad" }])).toEqual(bars);
  });

  it("an empty backfill waits for a retry instead of failing the chunk", async () => {
    const { db, writes } = fakeDb([row()]); const { api } = fakeApi({ eodRows: [] });
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "backfill"], {}), "2026-11-06");
    expect(result).toMatchObject({ empty: 1, failures: 0, processed: 0 });
    expect(writes).toContain("UPDATE etf_tracked SET");
  });

  it("stops at the account-wide daily budget read from eodhd_call_log", async () => {
    const { db } = fakeDb([row(), row({ listing_key: "Y", vendor_symbol: "Y.US" })], 2, 69_999); const { api, seen } = fakeApi();
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "dividends"], {}), "2026-11-06");
    expect(result).toMatchObject({ accountCallsToday: 69_999, cap: 1, calls: 1, processed: 1, deferred: 1 });
    expect(seen).toHaveLength(1);
  });

  it("counts ETF enrich rows against the shared account budget", async () => {
    const rows = [{ job: "eodhd-etf", calls: 69_980 }, { job: "etf-enrich", calls: 20 }];
    const { db } = fakeDb([row()], 1, rows); const { api, seen } = fakeApi();
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "dividends"], {}), "2026-11-06");
    expect(result).toMatchObject({ accountCallsToday: 70_000, cap: 0, calls: 0, processed: 0, deferred: 1 });
    expect(seen).toHaveLength(0);
  });

  it("finds a missed weekday but not a weekend", () => {
    expect(missedWeekday("2026-10-30", "2026-11-02")).toBe(false);
    expect(missedWeekday("2026-11-03", "2026-11-06")).toBe(true);
    expect(missedWeekday("2026-11-05", "2026-11-06")).toBe(false);
    expect(missedWeekday(null, "2026-11-06")).toBe(false);
    expect(etfJobName("bars")).toBe("eodhd-etf");
    expect(etfJobName("fundamentals")).toBe("eodhd-etf-fundamentals");
  });

  it("backfill uses per-symbol history, a chunk limit, and marks completion", async () => {
    const { db, writes } = fakeDb([row()]); const { api, seen } = fakeApi();
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "backfill", "--limit", "1", "--max-calls", "1"], {}), "2026-11-06");
    expect(seen).toEqual(["e:SPY.US:2021-11-06"]);
    expect(result).toMatchObject({ processed: 1, bars: 3, calls: 1 });
    expect(writes).toContain("UPDATE etf_tracked SET");
  });

  it("weekly dividends and monthly fundamentals use separate queues and costs", async () => {
    const { db } = fakeDb([row({ last_dividend_date: "2025-12-19" })]);
    const dividends = fakeApi(); const div = await runEtfJob(db, dividends.api, parseEtfJobArgs(["--mode", "dividends", "--max-calls", "1"], {}), "2026-11-06");
    expect(dividends.seen).toEqual(["d:SPY.US:2025-12-20"]);
    expect(div).toMatchObject({ dividends: 3, calls: 1, processed: 1 });
    const details = fakeApi(); const detail = await runEtfJob(db, details.api, parseEtfJobArgs(["--mode", "fundamentals", "--max-calls", "10"], {}), "2026-11-06");
    expect(details.seen).toEqual([`f:SPY.US:${ETF_DETAIL_FILTER}`]);
    expect(detail).toMatchObject({ holdings: 12, calls: 10, processed: 1 });
  });

  it("stops on vendor access failure and records attempted calls", async () => {
    const { db } = fakeDb([row(), row({ listing_key: "Y", vendor_symbol: "Y.US" })]);
    const { api } = fakeApi({ fundamentals: new EodhdHttpError(403, "fundamentals") });
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--mode", "fundamentals"], {}), "2026-11-06");
    expect(result).toMatchObject({ failures: 1, deferred: 1, calls: 10, processed: 0 });
  });
});
