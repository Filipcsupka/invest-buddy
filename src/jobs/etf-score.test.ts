import { expect, it } from "vitest";
import { runEtfScore } from "./etf-score";

it("scores catalog fixtures and upserts point-in-time results", async () => {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const db = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("SELECT listing_key FROM etf_catalog")) return { rows: [{ listing_key: "FUND1" }] };
    if (sql.includes("FROM etf_catalog c")) return { rows: [{ listing_key: "FUND1", instrument_type: "ETF", name: "Plain fund", last_seen: "2026-11-12", trading_currency: "EUR", asset_class: "bond", ter_pct: "0.1", vendor_symbol: "FUND1.DE", replication: "full", domicile: "IE", detail_status: "ok" }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: [{ total_assets: "1000000000", total_assets_currency: "EUR", trading_currency: "EUR", inception_date: "2020-01-01" }] };
    if (sql.includes("FROM asset_bars WHERE vendor_symbol=$1")) return { rows: Array.from({ length: 252 }, (_, i) => ({ date: `2025-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + i % 28).padStart(2, "0")}`, close: "100", volume: "10000", currency: "EUR" })) };
    return { rows: [] };
  } };
  const result = await runEtfScore(db as never, "2026-11-12");
  expect(result).toEqual({ processed: 1, rated: 1 });
  const write = calls.find((c) => c.sql.includes("INSERT INTO etf_scores"));
  expect(write?.values?.slice(0, 3)).toEqual(["FUND1", "2026-11-12", "etf-v1-2026-11-12"]);
  expect(JSON.parse(String(write?.values?.[3]))).toHaveLength(11);
  expect(write?.values?.[6]).toBe("rated");
});
