import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const viewable = vi.fn();
const detail = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => "Basic test" }) }));
vi.mock("@/markets/gate", async () => {
  const { notFound } = await import("next/navigation");
  return { assertViewable: async () => { if (!viewable()) notFound(); }, marketsViewable: () => viewable() };
});
vi.mock("@/db/etf-view", () => ({ readEtfFundView: (...args: unknown[]) => detail(...args) }));
// The paid fund permission (canOpenFunds) follows the same switch here; detail-wording and access tests cover it with real viewers.
vi.mock("@/components/etf/owner", async () => {
  const { notFound } = await import("next/navigation");
  return { requireEtfScreeningAccess: async () => { if (!viewable()) notFound(); } };
});
import Page, * as route from "./page";
import type { EtfDetailView } from "@/db/etf-detail";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; viewable.mockReset(); detail.mockReset(); });
const props = (tab: string, locale = "en") => ({ params: Promise.resolve({ locale, key: "DE0000000001", tab }) });
const empty: EtfDetailView = { stats: null, vendorSymbol: null, currency: null, holdings: [], exposure: { region: [], sector: [], mcap: [], asset: [], credit: [] }, dividends: [], bars: [] };
const fundView = (data: EtfDetailView = empty) => ({ detail: data, dates: { stats: data.stats?.asOf ?? null, holdings: null, exposure: null, bars: null, dividends: null, catalog: "2026-11-06" }, category: null, indexName: null, ucitsHint: null, terPct: data.stats?.ongoingChargePct ?? null, duration: null, ytm: null, coupon: null, categoryMedianTer: null, benchmarkSymbol: null, holdingsTotal: data.holdings.length, holdingsPage: 1, returns: [{ period: "1y", fund: data.stats?.ret1yPct ?? null, fundSource: "reported", benchmark: null }, { period: "3y", fund: data.stats?.ret3yPct ?? null, fundSource: "reported", benchmark: null }, { period: "5y", fund: data.stats?.ret5yPct ?? null, fundSource: "reported", benchmark: null }], maxDrawdown3y: null, trailingYieldPct: null, paymentsLast12m: null, alternatives: [] });
const stats: NonNullable<EtfDetailView["stats"]> = { asOf: "2026-11-06", vendorSymbol: "IWDA.AS", origin: "job", isin: "IE00B4L5Y983", tradingCurrency: "EUR", totalAssets: 101_700_000_000, totalAssetsCurrency: null, yieldPct: null, dividendFrequency: null, inceptionDate: "2009-09-25", ongoingChargePct: 0.1974, netExpenseRatioPct: null, retYtdPct: 9.9, ret1yPct: 12.2, ret3yPct: null, ret5yPct: 10.7, ret10yPct: 12.7, vol1yPct: 12.6, vol3yPct: 11.7, sharpe3y: 1.39, holdingsCount: 10, holdingsListed: 10, fetchedAt: "2026-11-06T01:10:00Z" };

it("returns 404 before reading data when the owner gate fails", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(false);
  await expect(Page(props("overview"))).rejects.toThrow(/404|NOT_FOUND/);
  expect(detail).not.toHaveBeenCalled();
  expect((await route.generateMetadata(props("holdings"))).robots).toEqual({ index: false, follow: false });
});

it("rejects an unknown tab", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  await expect(Page(props("scores"))).rejects.toThrow(/404|NOT_FOUND/);
});

it("opens a fund tab when its colon listing key arrives percent encoded", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue(fundView());
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", key: "NASDAQ%3AS021", tab: "holdings" }) }));
  expect(html).toContain("/en/etf/fund/NASDAQ%3AS021/holdings");
  expect(detail).toHaveBeenCalledWith(expect.objectContaining({ listingKey: "NASDAQ:S021" }), "holdings", undefined, 1);
});

it.each(["en", "sk"])("shows vendor gaps as no data, never zero, in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue(fundView({ ...empty, stats, vendorSymbol: "IWDA.AS", currency: "EUR" }));
  const html = renderToStaticMarkup(await Page(props("overview", locale)));
  expect(html).toContain(locale === "en" ? "Not recorded" : "Nezaznamenané");
  expect(html).toContain(locale === "en" ? "UCITS hint (unconfirmed)" : "Náznak UCITS (nepotvrdený)");
  expect(html).toContain('aria-current="page"');
  expect(html).not.toMatch(/Buy zone|BUY_ZONE|Watch|Avoid/);
});

it("renders each tab with its empty state", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue(fundView({ ...empty, stats: { ...stats, holdingsListed: 10 }, holdings: [{ position: 1, symbol: "NVDA", exchange: "US", name: "NVIDIA Corporation", weightPct: 5.67, sector: "Technology", country: "United States" }] }));
  expect(renderToStaticMarkup(await Page(props("holdings")))).toContain("Stored holdings");
  expect(renderToStaticMarkup(await Page(props("exposure")))).toContain("No stored data for this block.");
  expect(renderToStaticMarkup(await Page(props("performance")))).toContain("12.20 %");
  expect(renderToStaticMarkup(await Page(props("dividends")))).toContain("Accumulating funds pay none.");
});

it("shows missing multi-year returns as unavailable", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue(fundView({ ...empty, stats: { ...stats, ret3yPct: null, ret5yPct: null, ret10yPct: null } }));
  const html = renderToStaticMarkup(await Page(props("performance")));
  expect(html).toContain("Not recorded");
  expect(html).toContain("3y");
});

it("renders chart strips, peer comparison, structure and bond facts", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  const bars = Array.from({ length: 260 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), open: 100, high: 101, low: 99, close: 100 + i / 10, volume: 1000 + i }));
  detail.mockResolvedValue({ ...fundView({ ...empty, stats, bars }), category: "World equity", indexName: "World index", ucitsHint: true, duration: 4.2, ytm: 3.1, coupon: 2.5, categoryMedianTer: 0.24, alternatives: [{ listingKey: "OTHER", name: "Other fund", terPct: 0.12, aumUsdM: 500 }], dates: { stats: "2026-11-06", holdings: null, exposure: null, bars: "2026-11-06", dividends: null, catalog: "2026-11-06" } });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", key: "DE0000000012", tab: "overview" }) }));
  expect(html).toContain("50-day average");
  expect(html).toContain("200-day average");
  expect(html).toContain("Drawdown from peak");
  expect(html).toContain("Category median TER");
  expect(html).toContain("Bond facts");
  expect(html).toContain("UCITS hint (unconfirmed)");
  expect(html).toContain("Other fund");
  expect(html).toContain("Data as of");
});

it("hides bond facts for equity funds", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue({ ...fundView({ ...empty, stats }), duration: 4.2, ytm: 3.1, coupon: 2.5 });
  const html = renderToStaticMarkup(await Page(props("overview")));
  expect(html).not.toContain('id="fund-bond"');
  expect(html).not.toContain("Bond facts");
});

it("paginates all stored holdings and shows an honest source note", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  const holdings = Array.from({ length: 25 }, (_, i) => ({ position: i + 51, symbol: `H${i + 51}`, exchange: null, name: `Holding ${i + 51}`, weightPct: 1, sector: null, country: null }));
  detail.mockResolvedValue({ ...fundView({ ...empty, stats: { ...stats, holdingsListed: 120 }, holdings }), holdingsTotal: 120, holdingsPage: 2 });
  const html = renderToStaticMarkup(await Page({ ...props("holdings"), searchParams: Promise.resolve({ page: "2" }) }));
  expect(detail).toHaveBeenCalledWith(expect.anything(), "holdings", undefined, 2);
  expect(html).toContain("Holding 51");
  expect(html).toContain("Holding 75");
  expect(html).toContain("Page 2 of 3");
  expect(html).toContain("?page=3");
  expect(html).not.toContain("Only the largest holdings are stored");
});

it("rejects a holdings page past the stored rows", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue({ ...fundView(), holdingsTotal: 50 });
  await expect(Page({ ...props("holdings"), searchParams: Promise.resolve({ page: "2" }) })).rejects.toThrow(/404|NOT_FOUND/);
});

it("names the proxy and labels return sources", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue({ ...fundView({ ...empty, stats }), benchmarkSymbol: "GSPC.INDX", returns: [{ period: "1y", fund: 10, fundSource: "price", benchmark: 8 }, { period: "3y", fund: 9, fundSource: "reported", benchmark: null }, { period: "5y", fund: 7, fundSource: "reported", benchmark: 6 }] });
  const html = renderToStaticMarkup(await Page(props("performance")));
  expect(html).toContain("S&amp;P 500");
  expect(html).not.toContain("GSPC.INDX");
  expect(html).toContain("price return");
  expect(html).toContain("reported return");
});
