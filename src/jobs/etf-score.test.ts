import { expect, it, vi } from "vitest";
import { runLoggedJob } from "./job-log";
import { runEtfScore } from "./etf-score";

it("scores catalog fixtures and upserts point-in-time results", async () => {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const db = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("SELECT listing_key FROM etf_catalog")) return { rows: [{ listing_key: "FUND1" }] };
    if (sql.includes("FROM etf_catalog c")) return { rows: [{ listing_key: "FUND1", instrument_type: "ETF", name: "Plain fund", last_seen: "2026-11-12", trading_currency: "EUR", asset_class: "bond", ter_pct: "0.1", vendor_symbol: "FUND1.DE", replication: "full", domicile: "IE", detail_status: "ok" }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: [{ total_assets: "1000000000", total_assets_currency: "EUR", trading_currency: "EUR", ongoing_charge_pct: 0.1, inception_date: "2020-01-01" }] };
    if (sql.includes("FROM asset_bars WHERE vendor_symbol=$1")) return { rows: Array.from({ length: 252 }, (_, i) => ({ date: new Date(Date.parse("2026-11-12") - i * 86400000).toISOString().slice(0, 10), close: "100", volume: "10000", currency: "EUR" })) };
    return { rows: [] };
  } };
  const result = await runEtfScore(db as never, "2026-11-12");
  expect(result).toMatchObject({ processed: 1, rated: 1, failures: 0, deleted: 0 });
  const write = calls.find((c) => c.sql.includes("INSERT INTO etf_scores"));
  expect(write?.values?.slice(0, 3)).toEqual(["FUND1", "2026-11-12", "etf-v1-2026-11-12"]);
  expect(JSON.parse(String(write?.values?.[3]))).toHaveLength(11);
  expect(write?.values?.[6]).toBe("rated");
});

it("continues after a failed listing and reports partial results and retention", async () => {
  const calls: string[] = [];
  const db = { query: async (sql: string, values?: unknown[]) => {
    calls.push(sql);
    if (sql.includes("SELECT listing_key")) return { rows: [{ listing_key: "BAD" }, { listing_key: "WRITEFAIL" }, { listing_key: "GOOD" }] };
    if (sql.includes("FROM etf_catalog c")) {
      if (values?.[0] === "BAD") throw new Error("read failed");
      return { rows: [{ name: "Plain", instrument_type: "ETF", last_seen: "2026-11-12" }] };
    }
    if (sql.startsWith("INSERT") && values?.[0] === "WRITEFAIL") throw new Error("write failed");
    return { rows: [], rowCount: sql.startsWith("DELETE") ? 2 : 0 };
  } };
  const result = await runEtfScore(db as never, "2026-11-12");
  expect(result).toMatchObject({ processed: 1, failures: 2, rated: 0, deleted: 2 });
  expect(JSON.parse(result.rejectionCounts)).toEqual({ insufficient_evidence: 1 });
  expect(calls.filter((sql) => sql.startsWith("INSERT"))).toHaveLength(2);
  expect(calls.at(-1)).toContain("as_of < $1::date - 400");
  const store = { start: vi.fn(), finish: vi.fn() };
  await runLoggedJob("etf-score", async () => result, { store });
  expect(store.finish).toHaveBeenCalledWith(expect.objectContaining({ job: "etf-score", status: "partial", counts: result }));
});
