import { expect, it } from "vitest";
import type pg from "pg";
import { EodhdHttpError } from "../data-providers/eodhd/client";
import { parseScreenerArgs, runScreener } from "./eodhd-screener";

const recordingDb = (existing: string[] = []) => {
  const sql: string[] = [], params: unknown[][] = [];
  const db = { query: async (text: string, values: unknown[]) => {
    sql.push(text); params.push(values);
    if (text.startsWith("SELECT 1 FROM screener_runs")) return { rows: existing.includes(String(values[0])) ? [{ "?column?": 1 }] : [] };
    return { rows: text.includes("RETURNING id") ? [{ id: "1" }] : [] };
  } } as unknown as Pick<pg.Pool, "query">;
  return { db, sql, params };
};
const api = (fail?: (preset: string) => Error | null) => {
  let calls = 0;
  const requests: { filters?: string; signals?: string; sort?: string; limit?: number }[] = [];
  return { requests, screener: async (options: { filters?: string; signals?: string; sort?: string; limit?: number }) => {
    calls += 5; requests.push(options);
    const error = fail?.(options.filters ?? "");
    if (error) throw error;
    return { data: [{ code: "AAPL", exchange: "US", name: "Apple Inc.", adjusted_close: 1 }] };
  }, getCallCosts: () => ({ screener: calls }) };
};

it("parses options and rejects unknown presets or caps", () => {
  expect(parseScreenerArgs([])).toEqual({ dryRun: false, force: false, maxCalls: 100 });
  expect(parseScreenerArgs(["--only", "us-mega-cap,us-mid-cap", "--max-calls", "10", "--dry-run", "--force"])).toEqual({ dryRun: true, force: true, maxCalls: 10, only: ["us-mega-cap", "us-mid-cap"] });
  expect(() => parseScreenerArgs(["--only", "nope"])).toThrow();
  expect(() => parseScreenerArgs(["--max-calls", "4"])).toThrow();
  expect(() => parseScreenerArgs(["--bogus"])).toThrow();
});

it("dry run makes no request and writes nothing", async () => {
  const { db, sql } = recordingDb();
  const result = await runScreener(db, null, parseScreenerArgs(["--dry-run"]), "2026-11-07");
  expect(result).toMatchObject({ presets: 10, estimatedCalls: 50, stored: 0, calls: 0 });
  expect(sql).toEqual([]);
});

it("stores each preset once a day, sends filters and signals, and logs billed calls", async () => {
  const { db, sql, params } = recordingDb(["us-mega-cap"]);
  const client = api();
  const result = await runScreener(db, client, parseScreenerArgs(["--only", "us-mega-cap,us-200d-high"]), "2026-11-07");
  expect(result).toMatchObject({ stored: 1, skipped: 1, rows: 1, calls: 5, failures: 0 });
  expect(client.requests[0]).toMatchObject({ signals: "200d_new_hi", sort: "market_capitalization.desc", limit: 100 });
  expect(JSON.parse(client.requests[0].filters!)).toContainEqual(["exchange", "=", "us"]);
  expect(sql.at(-1)).toContain("eodhd_call_log");
  expect(params.at(-1)).toEqual(["eodhd-screener", 5]);
});

it("stops before the call cap and on an access error", async () => {
  const capped = await runScreener(recordingDb().db, api(), parseScreenerArgs(["--max-calls", "10"]), "2026-11-07");
  expect(capped).toMatchObject({ stored: 2, capped: 8, calls: 10 });
  const denied = await runScreener(recordingDb().db, api(() => new EodhdHttpError(402, "screener")), parseScreenerArgs([]), "2026-11-07");
  expect(denied).toMatchObject({ stored: 0, failures: 1 });
  const flaky = await runScreener(recordingDb().db, api((filters) => filters.includes("xetra") ? new Error("boom") : null), parseScreenerArgs([]), "2026-11-07");
  expect(flaky).toMatchObject({ stored: 8, failures: 2, failedPresets: "xetra-large-cap,xetra-dividend" });
});
