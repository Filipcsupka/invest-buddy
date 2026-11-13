import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/viewer/viewer";

const scores = vi.fn();
const portfolio = vi.fn();
const viewer = vi.fn();
const marketData = vi.fn();
const changes = vi.fn();
vi.mock("@/data/store", () => ({ latestScoreSummaries: () => scores(), latestScores: () => scores(), latestPortfolio: () => portfolio() }));
vi.mock("@/data/state-changes", () => ({ latestStateChanges: () => changes() }));
vi.mock("@/viewer/get-viewer", () => ({ getViewer: () => viewer() }));
vi.mock("@/data/macro-calendar-store", () => ({ storedMacroEvents: async () => [] }));
vi.mock("@/data/cross-market-dashboard", async (importOriginal) => ({ ...await importOriginal<typeof import("@/data/cross-market-dashboard")>(), latestCrossMarketData: () => marketData(), latestPeriodPrices: async () => ({ stocks: {}, funds: {} }) }));
import Dashboard, { dashboardStockAccess } from "./page";

const props = (locale: "en" | "sk") => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) });
const viewers: Record<string, Viewer> = {
  anonymous: { tier: "free", preview: false },
  free: { tier: "free", preview: false, userId: "6", plan: "free" },
  passive: { tier: "free", preview: false, userId: "5", plan: "passive" },
  plus: { tier: "paid", preview: false, userId: "3", plan: "plus" },
  trial: { tier: "paid", preview: false, userId: "4", plan: "trial" },
  owner: { tier: "admin", preview: false, owner: true, userId: "1" },
  ownerPreview: { tier: "free", preview: true, owner: true, userId: null },
};
/** The card for one path, cut from the rendered HTML. */
const card = (html: string, path: string) => html.match(new RegExp(`<article[^>]*data-path="${path}"[\\s\\S]*?</article>`))?.[0] ?? "";
const env = { ...process.env };

beforeEach(() => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  delete process.env.VENDOR_DISPLAY_LICENSE;
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  portfolio.mockResolvedValue(null);
  changes.mockResolvedValue([]);
  marketData.mockResolvedValue({ sample: false, funds: [], indices: [] });
});
afterEach(() => { process.env = { ...env }; vi.clearAllMocks(); });

describe("dashboard stock access", () => {
  it.each([
    ["anonymous", false], ["free", false], ["passive", false], ["plus", true], ["trial", true], ["owner", true], ["ownerPreview", false],
  ] as const)("private use on: %s gets the stock board: %s", (name, expected) => {
    expect(dashboardStockAccess(viewers[name]!, { EODHD_PRIVATE_USE: "on" })).toBe(expected);
  });
  it("private use off leaves the board open, as before", () => {
    expect(dashboardStockAccess(viewers.anonymous!, { EODHD_PRIVATE_USE: "off" })).toBe(true);
  });
});

describe("choose your path", () => {
  it.each(["anonymous", "free", "passive"] as const)("%s: renders the paths and reads no stock, portfolio or market data", async (name) => {
    viewer.mockResolvedValue(viewers[name]);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(html).toContain("Choose your path");
    expect(scores).not.toHaveBeenCalled();
    expect(portfolio).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
    expect(marketData).not.toHaveBeenCalled();
    expect(html).not.toContain("data-state=\"setup\"");
    expect(html).not.toContain("Portfolio structure (example)");
  });

  it.each([
    ["en", "Active investor", "Passive investor", "Market overview", "€9.90 a month", "€5 a month", "or €99 a year", "or €50 a year", "Free"],
    ["sk", "Aktívny investor", "Pasívny investor", "Prehľad trhu", "9,90 € mesačne", "5 € mesačne", "alebo 99 € ročne", "alebo 50 € ročne", "Zadarmo"],
  ] as const)("shows three cards with plan, price and links in %s for a visitor", async (locale, active, passive, overview, activePrice, passivePrice, activeYear, passiveYear, free) => {
    viewer.mockResolvedValue(viewers.anonymous);
    const html = renderToStaticMarkup(await Dashboard(props(locale)));
    const normal = html.replace(/[\u00a0\u202f]/g, " ");
    for (const text of [active, passive, overview, activePrice, passivePrice, activeYear, passiveYear, free]) expect(normal).toContain(text);
    expect(card(html, "active")).toContain('data-state="locked"');
    expect(card(html, "active")).toContain(`href="/${locale}/pricing#plus"`);
    expect(card(html, "passive")).toContain('data-state="locked"');
    expect(card(html, "passive")).toContain(`href="/${locale}/pricing#passive"`);
    expect(card(html, "overview")).toContain('data-state="open"');
    expect(card(html, "overview")).toContain(`href="/${locale}/methodology"`);
    expect(html).not.toContain('data-state="current"');
  });

  it("highlights the free account's own path and locks the paid ones", async () => {
    viewer.mockResolvedValue(viewers.free);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(card(html, "overview")).toContain('data-state="current"');
    expect(card(html, "overview")).toContain("Your plan");
    expect(card(html, "passive")).toContain("Not in your plan");
    expect(card(html, "active")).toContain('data-state="locked"');
  });

  it("highlights Passive, opens ETFs and the indices, and locks Active with a link to its plan", async () => {
    viewer.mockResolvedValue(viewers.passive);
    const html = renderToStaticMarkup(await Dashboard(props("sk")));
    expect(card(html, "passive")).toContain('data-state="current"');
    expect(card(html, "passive")).toContain('href="/sk/etf"');
    expect(card(html, "passive")).toContain("Váš plán");
    expect(card(html, "overview")).toContain('data-state="open"');
    expect(card(html, "overview")).toContain('href="/sk/indices"');
    expect(card(html, "active")).toContain('data-state="locked"');
    expect(card(html, "active")).toContain('href="/sk/pricing#plus"');
    expect(card(html, "active")).toContain("Nie je vo vašom pláne");
  });

  it.each(["plus", "trial"] as const)("%s: highlights Active, shows the others as included, and keeps the stock board", async (name) => {
    viewer.mockResolvedValue(viewers[name]);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(card(html, "active")).toContain('data-state="current"');
    expect(card(html, "active")).toContain('href="/en/stocks"');
    expect(card(html, "passive")).toContain('data-state="open"');
    expect(card(html, "passive")).toContain("Included in your plan");
    expect(card(html, "overview")).toContain('href="/en/indices"');
    expect(html).not.toContain('data-state="locked"');
    expect(scores).toHaveBeenCalled();
  });

  it("shows no path cards to the owner, and the free cards in the owner's free preview", async () => {
    viewer.mockResolvedValue(viewers.owner);
    expect(renderToStaticMarkup(await Dashboard(props("en")))).not.toContain("data-investor-paths");
    viewer.mockResolvedValue(viewers.ownerPreview);
    const preview = renderToStaticMarkup(await Dashboard(props("en")));
    expect(preview).toContain("data-investor-paths");
    expect(preview).not.toContain('data-state="current"');
    expect(card(preview, "active")).toContain('data-state="locked"');
  });

  it("describes the free overview with indices once a vendor licence is in place", async () => {
    process.env.EODHD_PRIVATE_USE = "off";
    process.env.VENDOR_DISPLAY_LICENSE = "on";
    viewer.mockResolvedValue(viewers.free);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(card(html, "overview")).toContain('href="/en/indices"');
    expect(card(html, "overview")).toContain("Open the market overview");
    expect(card(html, "overview")).toContain("indices, the economy page, the calendar");
  });

  it.each(["en", "sk"] as const)("uses no advice, trader or return wording in %s", async (locale) => {
    viewer.mockResolvedValue(viewers.passive);
    const html = renderToStaticMarkup(await Dashboard(props(locale)));
    const block = html.slice(html.indexOf("data-investor-paths"), html.indexOf("</section>", html.indexOf("data-investor-paths")));
    expect(block).not.toMatch(/\b(?:buy|sell|trader|recommend|best|returns?|guarantee)\b|obchodník|kúp|predaj|odporúč|najlepš|výnos|zaručen/i);
  });
});

it("does not call an open-to-everyone path part of a Passive plan when private use is off", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  process.env.MARKETS_VIEWS = "on";
  viewer.mockResolvedValue({ tier: "free", preview: false, userId: "5", plan: "passive" });
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  portfolio.mockResolvedValue(null);
  changes.mockResolvedValue([]);
  const html = renderToStaticMarkup(await Dashboard(props("en")));
  expect(card(html, "active")).toContain('data-state="open"');
  expect(card(html, "active")).not.toContain("Included in your plan");
  expect(card(html, "passive")).toContain('data-state="current"');
});
