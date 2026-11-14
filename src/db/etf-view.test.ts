import { expect, it, vi } from "vitest";
import { sampleEtfCatalog } from "@/data/etf-fixtures";
import { PGlite } from "@electric-sql/pglite";
import { maxDrawdown, periodReturn, readEtfFundView, trailingDividends } from "./etf-view";

vi.mock("./etf-detail", () => ({ etfDetailView: async () => ({
  stats: { asOf: "2026-11-12", ret1yPct: 11, ret3yPct: 8, ret5yPct: 7, vol1yPct: 13, sharpe3y: 1.2, yieldPct: 2, ongoingChargePct: 0.19 },
  vendorSymbol: "TEST.US", currency: "USD", holdings: [], exposure: { region: [], sector: [], mcap: [], asset: [], credit: [] }, dividends: [],
  bars: Array.from({ length: 760 }, (_, i) => ({ date: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10), open: 100, high: 100, low: 100, close: i === 500 ? 50 : 100, volume: 100 })),
}) }));

it("annualises multi-year price returns and measures peak drawdown", () => {
  expect(periodReturn(Array(253).fill(100).map((v, i) => i === 252 ? 110 : v), 252)).toBeCloseTo(10);
  expect(periodReturn(Array(757).fill(100).map((v, i) => i === 756 ? 133.1 : v), 756)).toBeCloseTo(10, 0);
  expect(maxDrawdown([100, 110, 88, 95])).toBeCloseTo(-20);
  expect(periodReturn([100, 110], 252)).toBeNull();
});

it("calculates twelve-month yield only from fetched same-currency payments", () => {
  const rows = [{ exDate: "2026-01-01", amount: 1, currency: "EUR", period: null, payDate: null }, { exDate: "2026-06-01", amount: 2, currency: "EUR", period: null, payDate: null }];
  expect(trailingDividends(rows, "2026-11-12", 100, "EUR", true)).toEqual({ count: 2, yieldPct: 3 });
  expect(trailingDividends(rows, "2026-11-12", 100, "USD", true)).toEqual({ count: 2, yieldPct: null });
  expect(trailingDividends(rows, "2026-11-12", 100, "EUR", false)).toEqual({ count: null, yieldPct: null });
});

it("reads bond facts, peer median, same-index alternatives and source dates", async () => {
  const fund = { ...sampleEtfCatalog[1], listingKey: "TEST", assetClass: "bond" as const, trackedIndex: "Bond Index" };
  const seen: string[] = [];
  const db = { query: async (sql: string) => { seen.push(sql);
    if (sql.includes("SELECT s.category,s.index_name")) return { rows: [{ category: "Bonds", index_name: "Bond Index", ucits_hint: true, effective_duration: 4.2, yield_to_maturity: 3.1, coupon: 2.5, as_of: "2026-11-12" }] };
    if (sql.includes("max(as_of)")) return { rows: [{ holdings: "2026-11-10", exposure: "2026-11-09" }] };
    if (sql.includes("percentile_cont")) return { rows: [{ median: 0.22 }] };
    if (sql.includes("SELECT c.listing_key")) return { rows: [{ listing_key: "OTHER", name: "Other bond fund", ter_pct: 0.15, aum_usd_m: 200 }] };
    return { rows: [] };
  } };
  const view = await readEtfFundView(fund, db as never);
  expect(view).toMatchObject({ category: "Bonds", indexName: "Bond Index", ucitsHint: true, duration: 4.2, ytm: 3.1, coupon: 2.5, categoryMedianTer: 0.22, benchmarkSymbol: null });
  expect(view.dates.holdings).toBe("2026-11-10");
  expect(view.alternatives[0]).toMatchObject({ listingKey: "OTHER", terPct: 0.15 });
  expect(view.maxDrawdown3y).toBeCloseTo(-50);
  expect(seen.some((sql) => sql.includes("asset_bars"))).toBe(false);
});

it("runs the category and same-index read queries against Postgres", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE etf_catalog (listing_key text PRIMARY KEY,name text,instrument_type text,tracked_index text,ter_pct numeric,aum_usd_m numeric,ucits_hint boolean,ter_gap text);
      CREATE TABLE etf_fund_stats (listing_key text,as_of date,category text,index_name text,ucits_hint boolean,effective_duration numeric,modified_duration numeric,yield_to_maturity numeric,coupon numeric,ongoing_charge_pct numeric,net_expense_ratio_pct numeric,ter_ambiguous boolean);
      CREATE TABLE etf_tracked (listing_key text,dividends_fetched_at timestamptz);
      CREATE TABLE etf_holdings (listing_key text,as_of date);
      CREATE TABLE etf_exposure (listing_key text,as_of date);
      INSERT INTO etf_catalog VALUES ('TEST','Test bond','ETF','Bond Index',0.2,200,true,NULL),('OTHER','Other bond','ETF','Bond Index',0.1,500,true,NULL);
      INSERT INTO etf_fund_stats VALUES ('TEST','2026-11-12','Bonds','Bond Index',true,4.2,NULL,3.1,2.5,0.2,NULL,false),('OTHER','2026-11-12','Bonds','Bond Index',true,3.1,NULL,2.8,2.2,0.1,NULL,false);
      INSERT INTO etf_tracked VALUES ('TEST','2026-11-12');`);
    const fund = { ...sampleEtfCatalog[1], listingKey: "TEST", assetClass: "bond" as const, trackedIndex: "Bond Index" };
    const view = await readEtfFundView(fund, db as never);
    expect(view.categoryMedianTer).toBeCloseTo(0.15);
    expect(view.alternatives).toMatchObject([{ listingKey: "OTHER", terPct: 0.1 }]);
    expect(view.ucitsHint).toBe(true);
  } finally { await db.close(); }
});
