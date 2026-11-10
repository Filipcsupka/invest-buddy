import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { FEATURE_TIERS, TIERS, TIER_LIMITS } from "@/config/tiers";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { PLUS_PRICE, formatEur, yearlyPerMonth } from "@/app/[locale]/pricing/plans";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, usePathname: () => "/en/pricing" }));
vi.mock("next/headers", () => ({ headers: async () => { throw new Error("headers() must not be read on the pricing page"); } }));
import Pricing from "./page";

const original = { waitlist: process.env.WAITLIST, billing: process.env.BILLING };
afterEach(() => {
  for (const [key, env] of [["WAITLIST", original.waitlist], ["BILLING", original.billing]] as const) if (env === undefined) delete process.env[key]; else process.env[key] = env;
});

const render = async (locale: string) => renderToStaticMarkup(await Pricing({ params: Promise.resolve({ locale }) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\u00a0|&nbsp;/g, " ").replace(/\s+/g, " ");

it("is unavailable while WAITLIST is off", async () => {
  delete process.env.WAITLIST;
  await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");
});

it("formats the Plus prices per locale and keeps the yearly arithmetic true", () => {
  expect(formatEur("en", PLUS_PRICE.monthlyEur)).toBe("€9.90");
  expect(formatEur("sk", PLUS_PRICE.monthlyEur).replace(/\s/g, " ")).toBe("9,90 €");
  expect(formatEur("en", PLUS_PRICE.yearlyEur)).toBe("€99");
  // "Two months free": a year costs ten monthly payments.
  expect(Math.round(PLUS_PRICE.monthlyEur * 10 * 100) / 100).toBe(PLUS_PRICE.yearlyEur);
  expect(yearlyPerMonth()).toBe(8.25);
});

it.each([["en", "€9.90", "€99", "Two months free, about €8.25 a month", "VAT included"], ["sk", "9,90 €", "99 €", "Dva mesiace zadarmo, približne 8,25 € mesačne", "Vrátane DPH"]])("shows monthly and yearly Plus side by side in %s", async (locale, monthly, yearly, note, vat) => {
  process.env.WAITLIST = "on";
  const page = text(await render(locale));
  expect(page).toContain(monthly);
  expect(page).toContain(yearly);
  expect(page).toContain(note);
  expect(page).toContain(vat);
  expect(page).not.toMatch(/most popular|najobľúbenejš|checked|aria-pressed="true"/i);
});

it("waits for BILLING: waitlist state while off, a Choose Plus entry while on, never a card field", async () => {
  process.env.WAITLIST = "on";
  delete process.env.BILLING;
  const off = await render("en");
  expect(text(off)).toContain("Opens soon");
  expect(text(off)).toContain("Notify me when Plus opens");
  expect(off).toContain('id="join"');
  expect(off).not.toContain("Choose Plus");
  process.env.BILLING = "on";
  const on = await render("en");
  expect(text(on)).toContain("Choose Plus");
  for (const html of [off, on]) expect(html).not.toMatch(/card number|cvc|checkout|stripe/i);
});

const paid = [...Object.entries(TIERS), ...Object.entries(FEATURE_TIERS)].filter(([, e]) => e.tier === "paid").map(([id]) => id);
const banned = /beat the market|guarantee|\bbuy\b|\bbest\b|limited time|act now|hurry|last chance|don't miss|lifetime|poraz\w* trh|zaručen|\bkúp\w*|\bnajlepš\w*|len dnes|neváhajte|doživotn/i;

it.each(["en", "sk"] as const)("compares Free and Plus from the tier config, every paid id as a row, in %s", async (locale) => {
  process.env.WAITLIST = "on";
  const html = await render(locale);
  expect(html).toContain("<table");
  for (const id of paid) expect(html, id).toContain(`data-tier-id="${id}"`);
  expect(html.match(/data-tier-id="/g)).toHaveLength(paid.length);
  const pm = getPricingMessages(locale);
  for (const id of paid) expect(pm.rows[id as keyof typeof pm.rows], id).toBeDefined();
  expect(html).not.toContain('data-tier-id="scanner-rows-full"');
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
  expect(text(await render("sk"))).toContain(`Posledných ${TIER_LIMITS.free.scoreHistoryDays} dní`);
});

it("shows all four lock forms with the printed word Plus and sample stamps, and keeps the ADR-001 note", async () => {
  process.env.WAITLIST = "on";
  const html = await render("en");
  for (const form of ["control", "depth", "teaser", "card"]) expect(html).toContain(`data-form="${form}"`);
  expect(html.match(/<span>Plus<\/span>/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  expect(html).toContain(">Sample<");
  expect(html).not.toMatch(/filter:\s*blur|backdrop-filter/);
  expect(text(html)).toContain("not personal investment advice");
});

it("reads no request API, so the page is the same for every visitor", () => {
  const source = readFileSync("src/app/[locale]/(marketing)/pricing/page.tsx", "utf8");
  expect(source).not.toMatch(/next\/headers|searchParams|withPageLog/);
});
