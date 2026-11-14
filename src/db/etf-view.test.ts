import { beforeEach, expect, it, vi } from "vitest";
import { sampleEtfCatalog } from "@/data/etf-fixtures";
import { PGlite } from "@electric-sql/pglite";
import { maxDrawdown, periodReturn, readEtfFundView, trailingDividends } from "./etf-view";

const detailView = vi.hoisted(() => vi.fn());
vi.mock("./etf-detail", () => ({ etfDetailView: (...args: unknown[]) => detailView(...args) }));
const bars = (count: number, last = "2026-11-12", firstClose = 100, lastClose = 110) => Array.from({ length: count }, (_, i) => ({
  date: new Date(Date.parse(last) - (count - i - 1) * 86_400_000).toISOString().slice(0, 10),
  open: 100, high: 100, low: 100, close: i === 0 ? firstClose : i === count - 1 ? lastClose : 100, volume: 100,
}));
const detail = () => ({
  stats: { asOf: "2026-11-12", ret1yPct: 11, ret3yPct: 8, ret5yPct: 7, vol1yPct: 13, sharpe3y: 1.2, yieldPct: 2, ongoingChargePct: 0.19 },
  vendorSymbol: "TEST.US", currency: "USD", holdings: [], exposure: { region: [], sector: [], mcap: [], asset: [], credit: [] }, dividends: [], bars: bars(760).map((bar, i) => i === 500 ? { ...bar, close: 50 } : bar),
});
beforeEach(() => { detailView.mockReset().mockImplementation(async () => detail()); });

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
    if (sql.includes("percentile_cont")) return { rows: [{ median: 0.22 }] };
    if (sql.includes("SELECT listing_key,name,ter_pct")) return { rows: [{ listing_key: "OTHER", name: "Other bond fund", ter_pct: 0.15, aum_usd_m: 200 }] };
    return { rows: [] };
  } };
  const view = await readEtfFundView(fund, "overview", db as never);
  expect(view).toMatchObject({ category: "Bonds", indexName: "Bond Index", ucitsHint: true, duration: 4.2, ytm: 3.1, coupon: 2.5, categoryMedianTer: 0.22, benchmarkSymbol: null });
  expect(view.alternatives[0]).toMatchObject({ listingKey: "OTHER", terPct: 0.15 });
  expect(seen.some((sql) => sql.includes("asset_bars"))).toBe(false);
  expect(seen.find((sql) => sql.includes("percentile_cont"))).toContain("lower(s.category)=lower($1)");
});

it("limits tab reads to the datasets each tab displays", async () => {
  const fund = { ...sampleEtfCatalog[1], listingKey: "TEST" };
  const seen: string[] = [];
  const db = { query: async (sql: string) => { seen.push(sql); return { rows: [{ exposure: "2026-11-10", holdings: "2026-11-10", holdings_total: 75 }] }; } };
  const exposure = await readEtfFundView(fund, "exposure", db as never);
  expect(exposure.dates.exposure).toBe("2026-11-10");
  expect(detailView).toHaveBeenLastCalledWith("TEST", expect.objectContaining({ holdings: false, exposure: true, bars: false, dividends: false }), db);
  expect(seen).toHaveLength(1);
  await readEtfFundView(fund, "holdings", db as never, 2);
  expect(detailView).toHaveBeenLastCalledWith("TEST", expect.objectContaining({ holdingsLimit: 50, holdingsOffset: 50, holdings: true, bars: false, dividends: false }), db);
});

it("aligns equity proxy bars and keeps stored five-year return when fund bars are short", async () => {
  const fund = { ...sampleEtfCatalog[0], listingKey: "TEST", assetClass: "equity" as const, region: "US" };
  const proxy = bars(1261);
  const seen: string[] = [];
  const db = { query: async (sql: string) => { seen.push(sql);
    if (sql.includes("SELECT s.category,s.index_name")) return { rows: [{ category: "US equity", as_of: "2026-11-12" }] };
    if (sql.includes("FROM asset_bars")) return { rows: proxy.map((b) => ({ bar_date: b.date, close: b.close })) };
    return { rows: [] };
  } };
  const view = await readEtfFundView(fund, "performance", db as never);
  expect(view.benchmarkSymbol).toBe("GSPC.INDX");
  expect(seen.some((sql) => sql.includes("FROM asset_bars"))).toBe(true);
  expect(view.returns[0]).toMatchObject({ fundSource: "price", benchmark: expect.any(Number) });
  expect(view.returns[2]).toMatchObject({ fund: 7, fundSource: "reported", benchmark: expect.any(Number) });
  expect(view.maxDrawdown3y).toBeLessThan(0);
});

it.each([{ daysOld: 8, count: 1261 }, { daysOld: 0, count: 100 }])("uses reported fund returns when the proxy is misaligned or short (%j)", async ({ daysOld, count }) => {
  const fund = { ...sampleEtfCatalog[0], listingKey: "TEST", assetClass: "equity" as const, region: "US" };
  const last = new Date(Date.parse("2026-11-12") - daysOld * 86_400_000).toISOString().slice(0, 10);
  const db = { query: async (sql: string) => sql.includes("SELECT s.category,s.index_name") ? { rows: [{ category: "US equity" }] }
    : sql.includes("FROM asset_bars") ? { rows: bars(count, last).map((b) => ({ bar_date: b.date, close: b.close })) } : { rows: [] } };
  const view = await readEtfFundView(fund, "performance", db as never);
  expect(view.returns[0]).toMatchObject({ fund: 11, fundSource: "reported", benchmark: null });
  expect(view.returns[2]).toMatchObject({ fund: 7, fundSource: "reported", benchmark: null });
});

it("runs category and same-index reads against Postgres, excluding stale and zero TER", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE etf_catalog (listing_key text PRIMARY KEY,name text,instrument_type text,tracked_index text,ter_pct numeric,aum_usd_m numeric,ucits_hint boolean,ter_gap text);
      CREATE TABLE etf_fund_stats (listing_key text,as_of date,category text,index_name text,ucits_hint boolean,effective_duration numeric,modified_duration numeric,yield_to_maturity numeric,coupon numeric,ongoing_charge_pct numeric,net_expense_ratio_pct numeric,ter_ambiguous boolean);
      INSERT INTO etf_catalog VALUES ('TEST','Test bond','ETF','Bond Index',0.2,200,true,NULL),('OTHER','Other bond','ETF','Bond Index',0.1,500,true,NULL),('ZERO','Zero bond','ETF','Bond Index',0,100,true,NULL),('STALE','Stale bond','ETF','Bond Index',0.8,100,true,NULL);
      INSERT INTO etf_fund_stats VALUES ('TEST','2026-11-12','Bonds','Bond Index',true,4.2,NULL,3.1,2.5,0.2,NULL,false),('OTHER','2026-11-12','Bonds','Bond Index',true,3.1,NULL,2.8,2.2,0.1,NULL,false),('ZERO','2026-11-12','Bonds','Bond Index',true,NULL,NULL,NULL,NULL,0,NULL,false),('STALE','2026-11-01','Bonds','Bond Index',true,NULL,NULL,NULL,NULL,0.8,NULL,false),('STALE','2026-11-12','Other','Different Index',true,NULL,NULL,NULL,NULL,0.8,NULL,false);`);
    const fund = { ...sampleEtfCatalog[1], listingKey: "TEST", assetClass: "bond" as const, trackedIndex: "Bond Index" };
    const view = await readEtfFundView(fund, "overview", db as never);
    expect(view.categoryMedianTer).toBeCloseTo(0.15);
    expect(view.alternatives.map((p) => p.listingKey)).toEqual(["ZERO", "OTHER"]);
  } finally { await db.close(); }
});
