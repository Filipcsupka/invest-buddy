import { describe, expect, it } from "vitest";
import type pg from "pg";
import { EodhdHttpError } from "../data-providers/eodhd/client";
import spy from "./fixtures/eodhd-etf/spy-etf.json";
import iwda from "./fixtures/eodhd-etf/iwda-etf.json";
import spyDividends from "./fixtures/eodhd-etf/spy-div.json";
import iwdaBars from "./fixtures/eodhd-etf/iwda-eod.json";
import { ETF_DETAIL_FILTER, parseEtfJobArgs, runEtfJob } from "./eodhd-etf";

it("parses bounded options and reads the shared ETF call cap", () => {
  expect(parseEtfJobArgs([], {})).toEqual({ dryRun: false, maxTracked: 300, maxCalls: 500, backfill: 5 });
  expect(parseEtfJobArgs(["--dry-run", "--max-tracked", "50", "--backfill", "2"], { ETF_EODHD_MAX_CALLS: "120" })).toEqual({ dryRun: true, maxTracked: 50, maxCalls: 120, backfill: 2 });
  expect(() => parseEtfJobArgs([], { ETF_EODHD_MAX_CALLS: "abc" })).toThrow();
  expect(() => parseEtfJobArgs(["--max-tracked", "0"], {})).toThrow();
  expect(() => parseEtfJobArgs(["--bogus"], {})).toThrow();
});

type Due = { listing_key: string; vendor_symbol: string; isin: string | null; currency: string | null; detail_fresh: boolean; last_bar_date: string | null; last_dividend_date: string | null };
function fakeDb(due: Due[], candidates = due.length, tracked = due.length) {
  const writes: string[] = [];
  const query = async (text: string, values: unknown[] = []) => {
    if (text.includes("WITH resolved AS")) return { rows: Array.from({ length: candidates }, (_, i) => ({ listing_key: `K${i}`, vendor_symbol: `E${i}.US`, name: `Fund ${i}`, currency: "USD", exchange: "US", rank: i + 1 })) };
    if (text.includes("count(*)::text AS n FROM etf_tracked")) return { rows: [{ n: String(tracked) }] };
    if (text.includes("FROM etf_tracked t JOIN etf_catalog")) return { rows: due.slice(0, Number(values[0])) };
    if (/^\s*(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/.test(text)) writes.push(text.trim().split(/\s+/).slice(0, 3).join(" "));
    return { rows: [], rowCount: 0 };
  };
  const db = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pick<pg.Pool, "query" | "connect">;
  return { db, writes };
}
function fakeApi(responses: Record<string, unknown> = {}) {
  const costs = { fundamentals: 0, dividends: 0, eod: 0 };
  const seen: string[] = [];
  return {
    seen,
    api: {
      fundamentals: async <T,>(symbol: string, filter?: string) => {
        costs.fundamentals += 10; seen.push(`f:${symbol}:${filter}`);
        const value = responses[symbol]; if (value instanceof Error) throw value; return value as T;
      },
      dividends: async (symbol: string, options: { from?: string }) => { costs.dividends += 1; seen.push(`d:${symbol}:${options.from}`); return symbol === "SPY.US" ? spyDividends : []; },
      eod: async (symbol: string, options: { from?: string }) => { costs.eod += 1; seen.push(`e:${symbol}:${options.from}`); return iwdaBars; },
      getCallCosts: () => ({ ...costs }),
    },
  };
}
const row = (over: Partial<Due>): Due => ({ listing_key: "NYSEARCA:SPY", vendor_symbol: "SPY.US", isin: "US78462F1030", currency: "USD", detail_fresh: false, last_bar_date: null, last_dividend_date: null, ...over });

describe("runEtfJob", () => {
  it("dry run reads only: no sync, no requests, no writes", async () => {
    const { db, writes } = fakeDb([row({}), row({ listing_key: "AS:IWDA", vendor_symbol: "IWDA.AS", detail_fresh: true })], 14, 14);
    const result = await runEtfJob(db, null, parseEtfJobArgs(["--dry-run"], {}), "2026-11-06");
    expect(writes).toEqual([]);
    expect(result).toMatchObject({ candidates: 14, due: 2, estimatedCalls: 12 + 2, calls: 0, dryRun: true });
  });

  it("stores detail, dividends and bars, then logs billed calls", async () => {
    const { db, writes } = fakeDb([row({ last_bar_date: "2026-10-26", last_dividend_date: "2025-12-19" })]);
    const { api, seen } = fakeApi({ "SPY.US": spy });
    const result = await runEtfJob(db, api, parseEtfJobArgs([], {}), "2026-11-06");
    expect(ETF_DETAIL_FILTER).toBe("General,ETF_Data,Technicals");
    expect(seen).toEqual([`f:SPY.US:${ETF_DETAIL_FILTER}`, "d:SPY.US:2025-12-20", "e:SPY.US:2026-10-27"]);
    expect(result).toMatchObject({ processed: 1, holdings: 12, dividends: 3, bars: 3, calls: 12, failures: 0, deferred: 0 });
    expect(writes).toContain("INSERT INTO etf_fund_stats");
    expect(writes.filter((text) => text.startsWith("INSERT INTO eodhd_call_log"))).toHaveLength(1);
  });

  it("skips a fresh enrich payload and defers listings past the call cap", async () => {
    const due = [row({ listing_key: "A", vendor_symbol: "A.US", detail_fresh: true }), row({ listing_key: "B", vendor_symbol: "B.US" }), row({ listing_key: "C", vendor_symbol: "C.US" })];
    const { db } = fakeDb(due, 21, 21);
    const { api, seen } = fakeApi({ "B.US": spy, "C.US": spy });
    const result = await runEtfJob(db, api, parseEtfJobArgs(["--max-calls", "14"], {}), "2026-11-06");
    expect(seen.filter((call) => call.startsWith("f:"))).toEqual([`f:B.US:${ETF_DETAIL_FILTER}`]);
    expect(result).toMatchObject({ freshSkipped: 1, processed: 2, deferred: 1, calls: 14 });
  });

  it("marks a mismatched ISIN without storing it and stops on an access error", async () => {
    const { db, writes } = fakeDb([row({ listing_key: "X", vendor_symbol: "IWDA.AS", isin: "IE0000000000" }), row({ listing_key: "Y", vendor_symbol: "NOPE.US" }), row({ listing_key: "Z", vendor_symbol: "LATER.US" })], 21, 21);
    const { api } = fakeApi({ "IWDA.AS": iwda, "NOPE.US": new EodhdHttpError(403, "fundamentals") });
    const result = await runEtfJob(db, api, parseEtfJobArgs([], {}), "2026-11-06");
    expect(writes).not.toContain("INSERT INTO etf_fund_stats");
    expect(result).toMatchObject({ processed: 1, failures: 1, failedSymbols: "NOPE.US", deferred: 1 });
  });
});
