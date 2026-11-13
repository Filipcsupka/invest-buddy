import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Viewer } from "@/viewer/viewer";
const state = vi.hoisted(() => ({ viewer: {} as Viewer, vendor: true }));
vi.mock("@/viewer/get-viewer", async (original) => ({ ...await original<typeof import("@/viewer/get-viewer")>(), getViewer: async () => state.viewer }));
vi.mock("@/db/pool", () => ({ getPool: () => ({ query: async () => ({ rows: [{ present: state.vendor }] }) }) }));
vi.mock("@/db/etf", () => ({ etfList: async () => ({ picks: [], run: null, sample: false }), etfDetail: async () => null }));
vi.mock("@/db/etf-score", () => ({ latestEtfScores: async () => new Map() }));
vi.mock("@/db/etf-catalog", () => ({
  etfCatalogList: async () => ({ funds: [], stats: { size: 0, enriched: 0, shortlist: 0 }, options: { assetClasses: [], regions: [], exchanges: [], issuers: [] } }),
  etfCatalogDetail: async () => ({ fund: { listingKey: "TEST", name: "Plain fund", instrumentType: "ETF", enrichmentStatus: "pending" } }),
}));
vi.mock("@/db/etf-detail", () => ({ etfListStats: async () => new Map(), etfDetailView: async () => ({ stats: null, holdings: [], exposure: { region: [], sector: [], mcap: [], asset: [], credit: [] }, dividends: [], bars: [] }) }));
import ListPage, { generateMetadata as listMetadata } from "./page";
import FundPage, { generateMetadata as fundMetadata } from "./fund/[key]/page";
import TabPage from "./fund/[key]/[tab]/page";
import { assertViewable } from "@/markets/gate";
import { requireEtfScreeningAccess } from "@/components/etf/owner";
import { ETF_TABS } from "@/components/etf/tabs";

afterEach(() => vi.unstubAllEnvs());
// [name, viewer, ETF pages and tabs, stock-level market gate]
const viewers: [string, Viewer, boolean, boolean][] = [
  ["anonymous", { tier: "free", preview: false }, false, false],
  ["free", { tier: "free", preview: false, userId: "free", plan: "free" }, false, false],
  ["passive", { tier: "free", preview: false, userId: "passive", plan: "passive" }, true, false],
  ["trial", { tier: "paid", preview: false, userId: "trial", plan: "trial" }, true, true],
  ["plus", { tier: "paid", preview: false, userId: "plus", plan: "plus" }, true, true],
  ["owner", { tier: "admin", preview: false, userId: "owner", owner: true }, true, true],
];
it.each(viewers)("enforces page and vendor tab access for %s", async (_name, viewer, allowed, stockMarkets) => {
  vi.stubEnv("DATA_MODE", "db");
  vi.stubEnv("EODHD_PRIVATE_USE", "on");
  vi.stubEnv("MARKETS_VIEWS", "on");
  state.viewer = viewer;
  state.vendor = true;
  const props = { params: Promise.resolve({ locale: "en", key: "TEST" }) };
  for (const page of [ListPage, FundPage]) {
    if (allowed) expect(renderToStaticMarkup(await page(props))).toContain("ETF");
    else await expect(page(props)).rejects.toThrow(/404|NOT_FOUND/);
  }
  for (const metadata of [listMetadata, fundMetadata]) {
    if (allowed) await expect(metadata(props)).resolves.toBeDefined();
    else await expect(metadata(props)).rejects.toThrow(/404|NOT_FOUND/);
  }
  for (const tab of ETF_TABS) {
    const result = TabPage({ params: Promise.resolve({ locale: "en", key: "TEST", tab }) });
    if (allowed) expect(renderToStaticMarkup(await result)).toContain("frame page");
    else await expect(result).rejects.toThrow(/404|NOT_FOUND/);
  }
  if (stockMarkets) await expect(assertViewable()).resolves.toBeUndefined();
  else await expect(assertViewable()).rejects.toThrow(/404|NOT_FOUND/);
});
it.each([[false, false, false], [true, false, false], [false, true, false]])("gates anonymous catalog access for vendor=%s private=%s", async (vendor, privateMode, allowed) => {
  vi.stubEnv("DATA_MODE", "db");
  vi.stubEnv("EODHD_PRIVATE_USE", privateMode ? "on" : "off");
  state.viewer = { tier: "free", preview: false };
  state.vendor = vendor;
  if (allowed) await expect(requireEtfScreeningAccess()).resolves.toBeUndefined();
  else await expect(requireEtfScreeningAccess()).rejects.toThrow(/404|NOT_FOUND/);
});
