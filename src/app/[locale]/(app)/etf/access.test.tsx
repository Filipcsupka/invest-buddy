import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Viewer } from "@/viewer/viewer";
const state = vi.hoisted(() => ({ viewer: {} as Viewer, vendor: true, picks: [] as unknown[], lists: [] as unknown[] }));
vi.mock("@/viewer/get-viewer", async (original) => ({ ...await original<typeof import("@/viewer/get-viewer")>(), getViewer: async () => state.viewer }));
vi.mock("@/db/pool", () => ({ getPool: () => ({ query: async () => ({ rows: [{ present: state.vendor }] }) }) }));
vi.mock("@/db/etf", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/etf")>()), etfList: async () => ({ picks: state.picks, run: null, sample: false }), etfDetail: async () => null }));
vi.mock("@/db/etf-score", () => ({ latestEtfScores: async () => new Map() }));
vi.mock("@/db/etf-catalog", () => ({
  RATING_BANDS: ["rulesMet", "mostlyMet", "partlyMet", "fewMet"], TER_RANGES: {}, AUM_RANGES: {},
  normalizeCatalogFilters: (filters: Record<string, string>) => ({ ...filters, sort: "rating" }),
  etfCatalogList: async (...args: unknown[]) => { state.lists.push(args); return { funds: [], stats: { size: 0, enriched: 0, shortlist: 0 }, options: { assetClasses: [], regions: [], exchanges: [], issuers: [], categories: [] } }; },
  etfRatingSummary: async () => ({ asOf: null, inScope: 0, rated: 0, notRated: 0, incomplete: 0, bands: { rulesMet: 0, mostlyMet: 0, partlyMet: 0, fewMet: 0 }, sample: false }),
  etfTopRated: async () => ({ groups: [], sample: false }),
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

it("a licensed free account opens no ETF page or fund tab; Passive does", async () => {
  vi.stubEnv("DATA_MODE", "db");
  vi.stubEnv("EODHD_PRIVATE_USE", "off");
  vi.stubEnv("VENDOR_DISPLAY_LICENSE", "on");
  vi.stubEnv("MARKETS_VIEWS", "on");
  state.vendor = true;
  const props = { params: Promise.resolve({ locale: "en", key: "TEST" }) };
  state.viewer = { tier: "free", preview: false, userId: "free", plan: "free" };
  for (const page of [ListPage, FundPage]) await expect(page(props)).rejects.toThrow(/404|NOT_FOUND/);
  for (const tab of ETF_TABS) await expect(TabPage({ params: Promise.resolve({ locale: "en", key: "TEST", tab }) })).rejects.toThrow(/404|NOT_FOUND/);
  // The free licensed market rule still opens indices, economy and calendar.
  await expect(assertViewable("eodhd", "indices")).resolves.toBeUndefined();
  await expect(assertViewable("eodhd", "etf")).rejects.toThrow(/404|NOT_FOUND/);
  state.viewer = { tier: "free", preview: false, userId: "passive", plan: "passive" };
  for (const tab of ETF_TABS) expect(renderToStaticMarkup(await TabPage({ params: Promise.resolve({ locale: "en", key: "TEST", tab }) }))).toContain("frame page");
});

const pick = { symbol: "FTSS", exchange: "NYSEARCA", name: "Model pick fund", isin: null, assetClass: "equity", region: "US", call: "AVOID", conviction: 3, thesis: "", whatHappened: [], whyItMatters: "", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
  terPct: 0.1, aumUsdM: 10, trackedIndex: null, domicile: null, replication: null, price: null, priceCurrency: null, priceAsOf: null, evidence: [], verificationStatus: "partial", firstSeenAt: "2026-10-21", lastSeenAt: "2026-10-21", benchmarkSymbol: "SPY" };
it.each(viewers.filter(([, , allowed]) => allowed))("shows model calls and the call filter only to the owner: %s", async (name, viewer) => {
  vi.stubEnv("DATA_MODE", "db");
  vi.stubEnv("EODHD_PRIVATE_USE", "on");
  vi.stubEnv("MARKETS_VIEWS", "on");
  state.viewer = viewer;
  state.picks = [pick];
  state.lists = [];
  try {
    const html = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ call: "AVOID", assetClass: "equity" }) }));
    // The catalog read never receives the call parameter.
    expect(state.lists.every((args) => !Object.hasOwn((args as [Record<string, string>])[0], "call"))).toBe(true);
    if (name === "owner") {
      expect(html).toContain("Model pick fund");
      expect(html).toContain('name="call"');
      expect(html).toContain("Avoid");
      expect(html).toContain("3/5");
    } else {
      expect(html).not.toContain("Model pick fund");
      expect(html).not.toContain('name="call"');
      expect(html).not.toMatch(/Avoid|Buy zone|Conviction|3\/5|Partly verified|track-record/);
    }
  } finally { state.picks = []; }
});
