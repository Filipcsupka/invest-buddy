import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const viewable = vi.fn();
const detail = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => "Basic test" }) }));
vi.mock("@/markets/gate", async () => {
  const { notFound } = await import("next/navigation");
  return { assertViewable: async () => { if (!viewable()) notFound(); }, marketsViewable: () => viewable() };
});
vi.mock("@/db/etf-detail", () => ({ etfDetailView: (...args: unknown[]) => detail(...args) }));
import Page, * as route from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; viewable.mockReset(); detail.mockReset(); });
const props = (tab: string, locale = "en") => ({ params: Promise.resolve({ locale, key: "DE0000000001", tab }) });
const empty = { stats: null, vendorSymbol: null, currency: null, holdings: [], exposure: { region: [], sector: [], mcap: [], asset: [], credit: [] }, dividends: [], bars: [] };
const stats = { asOf: "2026-11-06", vendorSymbol: "IWDA.AS", origin: "job", isin: "IE00B4L5Y983", tradingCurrency: "EUR", totalAssets: 101_700_000_000, totalAssetsCurrency: null, yieldPct: null, dividendFrequency: null, inceptionDate: "2009-09-25", ongoingChargePct: 0.1974, netExpenseRatioPct: null, retYtdPct: 9.9, ret1yPct: 12.2, ret3yPct: null, ret5yPct: 10.7, ret10yPct: 12.7, vol1yPct: 12.6, vol3yPct: 11.7, sharpe3y: 1.39, holdingsCount: 10, holdingsListed: 10, fetchedAt: "2026-11-06T01:10:00Z" };

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
  detail.mockResolvedValue(empty);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", key: "NASDAQ%3AS021", tab: "holdings" }) }));
  expect(html).toContain("/en/etf/fund/NASDAQ%3AS021/holdings");
  expect(detail).toHaveBeenCalledWith("NASDAQ:S021", expect.any(Object));
});

it.each(["en", "sk"])("shows vendor gaps as no data, never zero, in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue({ ...empty, stats, vendorSymbol: "IWDA.AS", currency: "EUR" });
  const html = renderToStaticMarkup(await Page(props("overview", locale)));
  expect(html).toContain(locale === "en" ? "No data" : "Bez údajov");
  expect(html).toContain(locale === "en" ? "Currency not stated by the vendor." : "Dodávateľ neuvádza menu.");
  expect(html).toContain('aria-current="page"');
  expect(html).not.toMatch(/Buy zone|BUY_ZONE|Watch|Avoid/);
});

it("renders each tab with its empty state", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue({ ...empty, stats: { ...stats, holdingsListed: 10 }, holdings: [{ position: 1, symbol: "NVDA", exchange: "US", name: "NVIDIA Corporation", weightPct: 5.67, sector: "Technology", country: "United States" }] });
  expect(renderToStaticMarkup(await Page(props("holdings")))).toContain("ten largest");
  expect(renderToStaticMarkup(await Page(props("exposure")))).toContain("No breakdown stored.");
  expect(renderToStaticMarkup(await Page(props("performance")))).toContain("+12.20 %");
  expect(renderToStaticMarkup(await Page(props("dividends")))).toContain("Accumulating funds pay none.");
});

it("shows missing multi-year returns as dashes, including stored vendor zeroes", async () => {
  process.env.DATA_MODE = "fixture";
  viewable.mockReturnValue(true);
  detail.mockResolvedValue({ ...empty, stats: { ...stats, ret3yPct: 0, ret5yPct: null, ret10yPct: 0 } });
  const html = renderToStaticMarkup(await Page(props("performance")));
  expect(html).not.toContain("0.00 %");
  expect(html).toMatch(/3 years \(annualised\)<\/th><td class="num">—<\/td>/);
});
