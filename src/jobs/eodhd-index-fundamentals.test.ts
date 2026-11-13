import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { EodhdHttpError } from "../data-providers/eodhd/client";
import { indexComponents, latestIndexSnapshot, parseIndexFundamentals, parseIndexGeneral } from "../db/markets";
import { DEFAULT_MAX_CALLS, parseIndexFundamentalsArgs, runIndexFundamentals, SNAPSHOT_FILTER } from "./eodhd-index-fundamentals";

async function withDb(fn: (pool: pg.Pool) => Promise<void>) {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  try { await fn({ query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as pg.Pool); } finally { await db.close(); }
}

const GSPC = {
  General: { Code: "GSPC", Type: "INDEX", Name: "S&P 500 Index", Exchange: "INDX", CurrencyCode: "USD", CountryName: "USA", Nested: { x: 1 } },
  Components: { "0": { Code: "AAPL", Exchange: "US", Name: "Apple Inc", Sector: "Technology", Industry: "Consumer Electronics", Weight: 0.07 },
    "1": { Code: "AIZ", Exchange: "US", Name: "Assurant", Sector: "Financial Services", Industry: "Insurance", Weight: 0.0002 } },
};
const GDAXI = { General: { Code: "GDAXI", Name: "DAX Index", CurrencyCode: "EUR" }, Components: { "0": { Code: "SAP", Exchange: "XETRA", Weight: null } } };
const VIX = { General: { Code: "VIX", Name: "CBOE Volatility Index", CurrencyCode: "USD" }, Components: [] };

describe("index fundamentals options", () => {
  it("bounds the call budget, with an env override", () => {
    expect(parseIndexFundamentalsArgs([], {})).toEqual({ dryRun: false, staleDays: 6, maxCalls: DEFAULT_MAX_CALLS });
    expect(parseIndexFundamentalsArgs([], { INDEX_FUNDAMENTALS_MAX_CALLS: "120" }).maxCalls).toBe(120);
    expect(parseIndexFundamentalsArgs(["--max-calls", "30", "--only", "gspc.indx"], { INDEX_FUNDAMENTALS_MAX_CALLS: "120" })).toMatchObject({ maxCalls: 30, only: ["GSPC.INDX"] });
    expect(() => parseIndexFundamentalsArgs([], { INDEX_FUNDAMENTALS_MAX_CALLS: "5" })).toThrow();
    expect(() => parseIndexFundamentalsArgs(["--stale-days", "0"], {})).toThrow();
    expect(() => parseIndexFundamentalsArgs(["--bogus"], {})).toThrow();
  });

  it("parses the General block and both response blocks", () => {
    expect(parseIndexGeneral(GSPC.General)).toEqual({ name: "S&P 500 Index", currency: "USD", country: "USA",
      raw: { Code: "GSPC", Type: "INDEX", Name: "S&P 500 Index", Exchange: "INDX", CurrencyCode: "USD", CountryName: "USA" } });
    expect(parseIndexGeneral([])).toBeNull();
    expect(parseIndexGeneral({ Nested: {} })).toBeNull();
    expect(parseIndexFundamentals(GSPC)?.components).toHaveLength(2);
    expect(parseIndexFundamentals(VIX)).toEqual({ general: expect.objectContaining({ name: "CBOE Volatility Index" }), components: [] });
    expect(parseIndexFundamentals([])).toBeNull();
    expect(parseIndexFundamentals({ Other: 1 })).toBeNull();
  });
});

describe("index fundamentals job (PGlite)", () => {
  it("stores General and constituents with provenance, records empty lists, respects the budget and logs calls", () => withDb(async (pool) => {
    let calls = 0;
    const requests: string[] = [];
    const bodies: Record<string, unknown> = { "GSPC.INDX": GSPC, "NDX.INDX": GSPC, "DJI.INDX": GSPC, "VIX.INDX": VIX, "GDAXI.INDX": GDAXI };
    const api = { fundamentals: async <T>(symbol: string, filter?: string) => {
      calls += 10; requests.push(`${symbol}:${filter}`);
      return (bodies[symbol] ?? []) as T;
    }, getCallCosts: () => ({ fundamentals: calls }) };
    const options = parseIndexFundamentalsArgs(["--max-calls", "50"], {});
    const result = await runIndexFundamentals(pool, api, options, "2026-11-15");
    expect(result).toMatchObject({ due: 25, estimatedCalls: 250, budget: 50, refreshed: 4, empty: 1, capped: 20, components: 7, weighted: 6, calls: 50, failures: 0 });
    expect(requests).toEqual(["GSPC.INDX", "NDX.INDX", "DJI.INDX", "VIX.INDX", "GDAXI.INDX"].map((symbol) => `${symbol}:${SNAPSHOT_FILTER}`));
    expect(await latestIndexSnapshot("GSPC.INDX", pool)).toMatchObject({
      asOf: "2026-11-15", name: "S&P 500 Index", currency: "USD", country: "USA", componentCount: 2, weightedCount: 2,
      sourceId: "eodhd", displayAllowed: false, general: { Code: "GSPC", CurrencyCode: "USD" },
    });
    expect((await latestIndexSnapshot("GSPC.INDX", pool))?.weightSum).toBeCloseTo(0.0702);
    expect(await latestIndexSnapshot("GDAXI.INDX", pool)).toMatchObject({ componentCount: 1, weightedCount: 0, weightSum: null });
    expect(await latestIndexSnapshot("VIX.INDX", pool)).toMatchObject({ componentCount: 0, name: "CBOE Volatility Index" });
    expect((await indexComponents("GSPC.INDX", pool)).rows.map((row) => [row.code, row.weight])).toEqual([["AAPL", 0.07], ["AIZ", 0.0002]]);
    const refresh = (await pool.query("SELECT index_symbol,status,component_count FROM index_snapshot_refresh ORDER BY index_symbol")).rows;
    expect(refresh).toContainEqual({ index_symbol: "VIX.INDX", status: "empty", component_count: 0 });
    expect((await pool.query("SELECT calls FROM eodhd_call_log WHERE job='eodhd-index-fundamentals'")).rows).toEqual([{ calls: 50 }]);

    // A second run the same week asks only for the indices the budget skipped, oldest attempt first.
    requests.length = 0; calls = 0;
    const again = await runIndexFundamentals(pool, api, parseIndexFundamentalsArgs(["--max-calls", "10"], {}), "2026-11-15");
    expect(again).toMatchObject({ due: 20, refreshed: 0, empty: 1, capped: 19 });
    expect(requests).toEqual([`FCHI.INDX:${SNAPSHOT_FILTER}`]);
    // A rerun of the same day is idempotent: one snapshot row per index and day.
    await runIndexFundamentals(pool, api, parseIndexFundamentalsArgs(["--only", "GSPC.INDX", "--stale-days", "1"], {}), "2026-11-16");
    await runIndexFundamentals(pool, api, parseIndexFundamentalsArgs(["--only", "GSPC.INDX", "--stale-days", "1"], {}), "2026-11-17");
    expect((await pool.query("SELECT count(*)::int AS n FROM index_snapshots WHERE index_symbol='GSPC.INDX'")).rows[0]).toEqual({ n: 3 });
  }), 60_000);

  it("records a failed attempt, stops on an access error and makes no requests on a dry run", () => withDb(async (pool) => {
    const api = { fundamentals: async () => { throw new EodhdHttpError(403, "fundamentals"); }, getCallCosts: () => ({ fundamentals: 10 }) };
    const result = await runIndexFundamentals(pool, api, parseIndexFundamentalsArgs([], {}), "2026-11-15");
    expect(result).toMatchObject({ failures: 1, failedSymbols: "GSPC.INDX", refreshed: 0 });
    expect((await pool.query("SELECT status FROM index_snapshot_refresh WHERE index_symbol='GSPC.INDX'")).rows).toEqual([{ status: "failed" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM index_snapshots")).rows[0]).toEqual({ n: 0 });
    const dry = await runIndexFundamentals(pool, null, parseIndexFundamentalsArgs(["--dry-run"], {}), "2026-11-15");
    expect(dry).toMatchObject({ due: 24, estimatedCalls: 240, calls: 0 });
  }), 60_000);
});
