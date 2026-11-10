import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { IdentityState } from "./auth/identity-store";

const state = vi.hoisted(() => ({ current: { status: "pending" } as IdentityState }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard" }));
vi.mock("./auth/identity-store", async (importOriginal) => ({ ...(await importOriginal<typeof import("./auth/identity-store")>()), useIdentity: () => state.current }));
vi.mock("@/data/store", () => ({ latestScores: async () => ({ rows: [], sample: false, lastUpdated: null, stale: false }) }));
import { Nav } from "./nav";

const hiddenFromCustomers = ["indices", "forex", "crypto", "economy", "congress", "news", "screener", "etf", "etf/track-record"];
const saved = { markets: process.env.MARKETS_VIEWS, use: process.env.EODHD_PRIVATE_USE };
afterEach(() => {
  state.current = { status: "pending" };
  for (const [key, value] of [["MARKETS_VIEWS", saved.markets], ["EODHD_PRIVATE_USE", saved.use]] as const) if (value === undefined) delete process.env[key]; else process.env[key] = value;
});
const as = (me: Extract<IdentityState, { status: "ready" }>["me"]) => { state.current = { status: "ready", me }; };
const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);

it.each(["en", "sk"] as const)("never gives a customer, a visitor or a pending viewer an owner-only entry (%s)", (locale) => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "off" });
  for (const identity of [{ status: "server" }, { status: "pending" }, { status: "ready", me: { kind: "anon", markets: false } }, { status: "ready", me: { kind: "customer", email: "a@b.cz", plan: "free", markets: false } }, { status: "ready", me: { kind: "customer", email: "a@b.cz", plan: "plus", markets: false } }] as IdentityState[]) {
    state.current = identity;
    const html = renderToStaticMarkup(<Nav locale={locale} />);
    const hrefs = links(html);
    for (const route of hiddenFromCustomers) {
      expect(hrefs, route).not.toContain(`/${locale}/${route}`);
      expect(hrefs, route).not.toContain(`/${locale}/plus-preview?page=${encodeURIComponent(route)}`);
    }
    expect(html).not.toContain("etf-track");
    // The real entries stay.
    for (const route of ["dashboard", "scanner", "heatmap", "track-record", "insiders", "portfolio", "methodology", "pricing"]) expect(hrefs, route).toContain(`/${locale}/${route}`);
    expect(html).not.toContain("Soon");
  }
});

it.each(["en", "sk"] as const)("keeps one quiet Coming later group with no link, blur or lock for customers (%s)", (locale) => {
  as({ kind: "customer", email: "a@b.cz", plan: "free", markets: false });
  process.env.EODHD_PRIVATE_USE = "off";
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  const group = html.match(/<nav[^>]*nav-later[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
  expect(group).toContain(locale === "en" ? "Coming later" : "Neskôr");
  expect(group).not.toContain("<a ");
  expect(group).not.toMatch(/blur|lock|data-locked/);
  expect(group.match(/nav-later-item/g)?.length).toBeLessThanOrEqual(3);
  expect(html.match(/nav-later/g)?.length).toBe(1 + (group.match(/nav-later-item/g)?.length ?? 0));
});

it.each(["en", "sk"] as const)("shows the owner every entry as a direct link and no Coming later group (%s)", (locale) => {
  Object.assign(process.env, { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on" });
  as({ kind: "owner", markets: true });
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  const hrefs = links(html);
  for (const route of [...hiddenFromCustomers, "dashboard", "scanner", "heatmap", "track-record", "insiders", "portfolio", "methodology", "pricing"]) expect(hrefs, route).toContain(`/${locale}/${route}`);
  expect(html).not.toContain("nav-later");
  expect(html).not.toContain('data-locked=""');
  expect(html).toContain(locale === "en" ? "Owner only" : "Len vlastník");
});
