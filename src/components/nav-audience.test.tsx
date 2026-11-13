import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { IdentityState } from "./auth/identity-store";

const state = vi.hoisted(() => ({ current: { status: "pending" } as IdentityState }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard" }));
vi.mock("./auth/identity-store", async (importOriginal) => ({ ...(await importOriginal<typeof import("./auth/identity-store")>()), useIdentity: () => state.current }));
vi.mock("@/data/store", () => ({ latestScores: async () => ({ rows: [], sample: false, lastUpdated: null, stale: false }) }));
import { Nav } from "./nav";

const saved = { markets: process.env.MARKETS_VIEWS, use: process.env.EODHD_PRIVATE_USE, insiders: process.env.INSIDERS_PAGE };
afterEach(() => {
  state.current = { status: "pending" };
  for (const [key, value] of [["MARKETS_VIEWS", saved.markets], ["EODHD_PRIVATE_USE", saved.use], ["INSIDERS_PAGE", saved.insiders]] as const) if (value === undefined) delete process.env[key]; else process.env[key] = value;
});
const as = (me: Extract<IdentityState, { status: "ready" }>["me"]) => { state.current = { status: "ready", me }; };
const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
const paid = ["etf", "etf/track-record", "indices", "economy", "calendar", "news", "congress", "insiders", "screener"];

it.each(["en", "sk"] as const)("locks paid sections for free and anonymous viewers (%s)", (locale) => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on", INSIDERS_PAGE: "on" });
  for (const me of [{ kind: "anon", markets: false }, { kind: "customer", email: "a@b.cz", plan: "free", markets: false }] as const) {
    as(me);
    const html = renderToStaticMarkup(<Nav locale={locale} />);
    const hrefs = links(html);
    expect(html).toContain("nav-links");
    for (const route of paid) {
      expect(hrefs).not.toContain(`/${locale}/${route}`);
      expect(hrefs).toContain(`/${locale}/plus-preview?page=${encodeURIComponent(route)}`);
    }
  }
});

it.each(["en", "sk"] as const)("opens the sections for owner, Plus and active trial (%s)", (locale) => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on", INSIDERS_PAGE: "on" });
  for (const me of [{ kind: "owner", markets: true }, { kind: "customer", email: "a@b.cz", plan: "plus", markets: false }, { kind: "customer", email: "a@b.cz", plan: "trial", trialDaysLeft: 3, markets: false }] as const) {
    as(me);
    const hrefs = links(renderToStaticMarkup(<Nav locale={locale} />));
    for (const route of ["dashboard", "stocks", "heatmap", "track-record", "portfolio", ...paid, "methodology", "pricing"]) expect(hrefs).toContain(`/${locale}/${route}`);
  }
});

it.each(["plus", "trial"] as const)("labels ETF and market links Plus for %s customers", (plan) => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on", INSIDERS_PAGE: "on" });
  as({ kind: "customer", email: "a@b.cz", plan, markets: false });
  const html = renderToStaticMarkup(<Nav locale="en" />);
  for (const route of ["etf", "etf/track-record", "indices", "economy", "calendar", "news", "congress", "insiders", "screener"]) {
    const link = html.match(new RegExp(`<a[^>]*href="/en/${route}"[^>]*>[\\s\\S]*?<\\/a>`))?.[0];
    expect(link, route).toContain('data-tier="plus"');
    expect(link, route).not.toContain('data-tier="free"');
  }
});

it.each(["en", "sk"] as const)("opens ETF, indices, economy and calendar for Passive, and keeps stock sections locked (%s)", (locale) => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on", INSIDERS_PAGE: "on" });
  as({ kind: "customer", email: "a@b.cz", plan: "passive", markets: false });
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  const hrefs = links(html);
  for (const route of ["dashboard", "etf", "etf/track-record", "indices", "economy", "calendar", "methodology", "pricing"]) expect(hrefs, route).toContain(`/${locale}/${route}`);
  for (const route of ["stocks", "heatmap", "track-record", "portfolio", "news", "congress", "insiders", "screener"]) {
    expect(hrefs, route).not.toContain(`/${locale}/${route}`);
    expect(hrefs, route).toContain(`/${locale}/plus-preview?page=${encodeURIComponent(route)}`);
  }
  const etf = html.match(new RegExp(`<a[^>]*href="/${locale}/etf"[^>]*>[\\s\\S]*?<\\/a>`))?.[0];
  expect(etf).toContain(locale === "en" ? ">Passive<" : ">Pasívny<");
});

it("parses the Passive plan from /api/me", async () => {
  const { parseMe } = await import("./auth/identity-store");
  expect(parseMe({ kind: "customer", email: "a@b.cz", plan: "passive" })).toEqual({ kind: "customer", email: "a@b.cz", plan: "passive", markets: false });
  expect(parseMe({ kind: "customer", email: "a@b.cz", plan: "gold" })).toBeNull();
});

it("shows insiders in Stocks when markets are off", () => {
  Object.assign(process.env, { MARKETS_VIEWS: "off", EODHD_PRIVATE_USE: "on", INSIDERS_PAGE: "on" });
  as({ kind: "customer", email: "a@b.cz", plan: "plus", markets: false });
  const html = renderToStaticMarkup(<Nav locale="en" />);
  expect(links(html)).toContain("/en/insiders");
  expect(links(html)).not.toContain("/en/indices");
});

it("never offers Forex, Crypto, or the old scanner link", () => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on" });
  as({ kind: "owner", markets: true });
  const html = renderToStaticMarkup(<Nav locale="en" />);
  for (const route of ["forex", "crypto", "scanner"]) expect(links(html)).not.toContain(`/en/${route}`);
});

it.each([["en", "My portfolio (connect your broker)"], ["sk", "Moje portfólio (prepojenie s brokerom)"]] as const)("renders the future portfolio as text without a link (%s)", (locale, label) => {
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  const group = html.match(/<nav[^>]*nav-later[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
  expect(group).toContain(label);
  expect(group).not.toContain("<a ");
});
