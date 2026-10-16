import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";
import { FEATURE_TIERS, TIERS, TIER_LIMITS } from "@/config/tiers";
import { getPricingMessages } from "@/i18n/pricing-messages";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
vi.mock("@/data/launch-facts", () => ({ recordStartDate: async () => null }));
import Pricing from "./page";
import Home from "../page";

const original = process.env.WAITLIST;
afterEach(() => { scores.mockReset(); if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

const render = async (locale: string) => renderToStaticMarkup(await Pricing({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ");
/** Any currency sign or code, or a number next to one. */
const money = /€|\$|\bEUR\b|\beuro|\d+(?:[.,]\d+)?\s*(?:EUR|€)/i;

it("is unavailable while WAITLIST is off", async () => {
  delete process.env.WAITLIST;
  await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");
});

it.each([["en", "Beta: free while we test. Paid plans later. No prices yet.", "Join the waitlist"], ["sk", "Beta: zadarmo, kým testujeme. Platené plány neskôr. Zatiaľ bez cien.", "Pridať sa na listinu"]])("shows the beta note and the waitlist form without prices in %s", async (locale, lede, button) => {
  process.env.WAITLIST = "on";
  const html = await render(locale);
  expect(text(html)).toContain(lede);
  expect(html).toContain(button);
  expect(html).toContain('name="email"');
  expect(text(html)).not.toMatch(money);
  expect(html).not.toMatch(/checkout|stripe|subscribe now|lifetime|doživotn/i);
});

const paid = [...Object.entries(TIERS), ...Object.entries(FEATURE_TIERS)].filter(([, e]) => e.tier === "paid").map(([id]) => id);
/** Banned promise, urgency and recommendation wording, English and Slovak. */
const banned = /beat the market|guarantee|\bbuy\b|\bbest\b|limited time|act now|hurry|last chance|don't miss|poraz\w* trh|zaručen|\bkúp\w*|\bnajlepš\w*|len dnes|neváhajte/i;

it.each(["en", "sk"] as const)("compares free and paid from the tier config, with every paid id as a row, in %s", async (locale) => {
  process.env.WAITLIST = "on";
  const html = await render(locale);
  expect(html).toContain("<table");
  expect(paid.length).toBeGreaterThan(5);
  for (const id of paid) expect(html, id).toContain(`data-tier-id="${id}"`);
  expect(html.match(/data-tier-id="/g)).toHaveLength(paid.length);
  const pm = getPricingMessages(locale);
  for (const id of paid) expect(pm.rows[id as keyof typeof pm.rows], id).toBeDefined();
  // A free id never appears as a paid row.
  expect(html).not.toContain('data-tier-id="scanner-rows-full"');
  expect(text(html)).not.toMatch(money);
  expect(text(html)).not.toMatch(banned);
  expect(text(html)).not.toContain("—");
});

it("shows the depth numbers from TIER_LIMITS in the matching cells", async () => {
  process.env.WAITLIST = "on";
  const en = text(await render("en"));
  expect(en).toContain(`Last ${TIER_LIMITS.free.scoreHistoryDays} days`);
  expect(en).toContain(`Last ${TIER_LIMITS.free.insiderDays} days`);
  expect(en).toContain(`Saved screens: ${TIER_LIMITS.paid.savedScreens}`);
  expect(en).toContain(`Up to ${TIER_LIMITS.paid.watchlistTickers} tickers`);
  const sk = text(await render("sk"));
  expect(sk).toContain(`Posledných ${TIER_LIMITS.free.scoreHistoryDays} dní`);
});

it("keeps the ADR-001 note and the no-price note", async () => {
  process.env.WAITLIST = "on";
  expect(text(await render("en"))).toContain("not personal investment advice");
  expect(text(await render("en"))).toContain("No price is set");
  expect(text(await render("sk"))).toContain("nie o osobné investičné poradenstvo");
});

it("names no price on the landing page either", async () => {
  process.env.WAITLIST = "on";
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-10-13", stale: false });
  for (const locale of ["en", "sk"]) {
    const home = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
    expect(text(home)).not.toMatch(money);
  }
});
