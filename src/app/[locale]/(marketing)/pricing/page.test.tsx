import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { FEATURE_TIERS, TIERS, TIER_LIMITS } from "@/config/tiers";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { canSeeStockData } from "@/viewer/viewer";
import { PASSIVE_PRICE, PLUS_PRICE, formatEur, yearlyPerMonth } from "@/app/[locale]/pricing/plans";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, usePathname: () => "/en/pricing" }));
vi.mock("next/headers", () => ({ headers: async () => { throw new Error("headers() must not be read on the pricing page"); } }));
import Pricing from "./page";

const original = { waitlist: process.env.WAITLIST, billing: process.env.BILLING };
afterEach(() => {
  for (const [key, env] of [["WAITLIST", original.waitlist], ["BILLING", original.billing]] as const) if (env === undefined) delete process.env[key]; else process.env[key] = env;
});

const render = async (locale: string) => renderToStaticMarkup(await Pricing({ params: Promise.resolve({ locale }) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\u00a0|&nbsp;/g, " ").replace(/\s+/g, " ");

it("renders the same static page whatever WAITLIST says", async () => {
  delete process.env.WAITLIST;
  const off = await render("en");
  process.env.WAITLIST = "on";
  expect(await render("en")).toBe(off);
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

it("shows Plus as opening soon without reading BILLING, and never a card field", async () => {
  for (const value of [undefined, "on"]) {
    if (value === undefined) delete process.env.BILLING; else process.env.BILLING = value;
    const html = await render("en");
    expect(text(html)).toContain("Opens soon");
    expect(text(html)).toContain("Notify me when Plus opens");
    expect(html).toContain('id="join"');
    expect(html).not.toContain("Choose Plus");
    expect(html).not.toMatch(/card number|cvc|checkout|stripe/i);
  }
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

it("shows the Plus depth numbers from TIER_LIMITS and no free depth in the stock table", async () => {
  process.env.WAITLIST = "on";
  const en = text(await render("en"));
  expect(en).toContain(`Saved screens: ${TIER_LIMITS.paid.savedScreens}`);
  expect(en).toContain(`Up to ${TIER_LIMITS.paid.watchlistTickers} tickers`);
  expect(en).toContain("Full history");
  // Free and Passive do not open the stock area, so no free depth is promised.
  expect(en).not.toContain(`Last ${TIER_LIMITS.free.scoreHistoryDays} days`);
  expect(en).not.toContain(`Last ${TIER_LIMITS.free.insiderDays} days`);
  expect(text(await render("sk"))).not.toContain(`Posledných ${TIER_LIMITS.free.scoreHistoryDays} dní`);
});

/** Route matrix (docs/paywall-segments.md): which plan opens each area. */
const MATRIX = { method: ["yes", "yes", "yes"], macro: ["yes", "yes", "yes"], markets: ["licence", "yes", "yes"], funds: ["no", "yes", "yes"], stocks: ["no", "no", "yes"] };

it.each(["en", "sk"] as const)("matches the route matrix everywhere on the page in %s: stock features only in Plus", async (locale) => {
  const html = await render(locale);
  const page = text(html);
  const access = (area: string) => [...(html.match(new RegExp(`<tr data-area="${area}">[\\s\\S]*?</tr>`))?.[0] ?? "").matchAll(/data-access="(\w+)"/g)].map((m) => m[1]);
  for (const [area, expected] of Object.entries(MATRIX)) expect(access(area), area).toEqual(expected);
  // Every stock feature row: not in Free, not in Passive, in Plus.
  for (const id of paid) {
    const row = html.match(new RegExp(`<tr data-tier-id="${id}">[\\s\\S]*?</tr>`))?.[0] ?? "";
    expect([...row.matchAll(/data-access="(\w+)"/g)].map((m) => m[1]), id).toEqual(["no", "no", "yes"]);
  }
  // No copy promises scores, the scanner, company pages or stock depth to Free or to everyone.
  const promises = locale === "en"
    ? /stay open to everyone|filters stay free|Always free|Free shows|free window|Dashboard, heat map and scanner|Company page: status|Score history and insider events for the recent window|Every plan shows the same rules and the same scores/i
    : /zostávajú otvorené pre všetkých|ostávajú zadarmo|Vždy zadarmo|Zadarmo vidíte|bezplatné okno|Dashboard, heat mapa a skener|Stránka spoločnosti: stav|Všetky plány ukazujú rovnaké pravidlá a rovnaké skóre/i;
  expect(page).not.toMatch(promises);
  // The Free plan card lists only the market overview items.
  const freeCard = text(html.slice(html.indexOf('data-plan="free"'), html.indexOf('data-plan="passive"')));
  expect(freeCard).not.toMatch(locale === "en" ? /score|scanner|company|track record|portfolio/i : /skóre|skener|spoločnost|portfóli/i);
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

it("formats the Passive price per locale and keeps its yearly arithmetic true", () => {
  expect(formatEur("en", PASSIVE_PRICE.monthlyEur)).toBe("€5");
  expect(formatEur("sk", PASSIVE_PRICE.monthlyEur).replace(/\s/g, " ")).toBe("5 €");
  expect(formatEur("en", PASSIVE_PRICE.yearlyEur)).toBe("€50");
  expect(Math.round(PASSIVE_PRICE.monthlyEur * 10 * 100) / 100).toBe(PASSIVE_PRICE.yearlyEur);
  expect(yearlyPerMonth(PASSIVE_PRICE)).toBe(4.17);
});

it.each([
  ["en", ["Market overview", "Passive investor", "Active investor"], ["€0", "€5", "€50", "€9.90", "€99"], "about €4.17 a month", "VAT included"],
  ["sk", ["Prehľad trhu", "Pasívny investor", "Aktívny investor"], ["0 €", "5 €", "50 €", "9,90 €", "99 €"], "približne 4,17 € mesačne", "Vrátane DPH"],
] as const)("shows the three plans side by side, cheapest first, in %s", async (locale, names, prices, passiveNote, vat) => {
  const html = await render(locale);
  const page = text(html);
  const plans = [...html.matchAll(/<article[^>]*data-plan="(\w+)"/g)].map((match) => match[1]);
  expect(plans).toEqual(["free", "passive", "plus"]);
  const cards = text(html.slice(html.indexOf('data-plan="free"'), html.indexOf('id="access"')));
  let at = -1;
  for (const name of names) { const next = cards.indexOf(name); expect(next, name).toBeGreaterThan(at); at = next; }
  for (const price of prices) expect(page, price).toContain(price);
  expect(page).toContain(passiveNote);
  expect(page).toContain(vat);
  for (const id of ["free", "passive", "plus"]) expect(html).toContain(`id="${id}"`);
  expect(page).not.toMatch(/trader|obchodník/i);
  expect(page).not.toMatch(banned);
});

it("tables which areas each plan opens: stocks only in Plus, funds from Passive up", async () => {
  const html = await render("en");
  const row = (area: string) => [...(html.match(new RegExp(`<tr data-area="${area}">[\\s\\S]*?</tr>`))?.[0] ?? "").matchAll(/data-access="(\w+)"/g)].map((m) => m[1]);
  expect(row("method")).toEqual(["yes", "yes", "yes"]);
  expect(row("macro")).toEqual(["yes", "yes", "yes"]);
  expect(row("markets")).toEqual(["licence", "yes", "yes"]);
  expect(row("funds")).toEqual(["no", "yes", "yes"]);
  expect(row("stocks")).toEqual(["no", "no", "yes"]);
});

it.each(["on", "off"] as const)("pricing stock cells match the stock gate with private use %s and either licence value", async (privateUse) => {
  const html = await render("en");
  const row = html.match(/<tr data-area="stocks">[\s\S]*?<\/tr>/)?.[0] ?? "";
  const cells = [...row.matchAll(/data-access="(\w+)"/g)].map((match) => match[1]);
  for (const licence of ["on", "off"]) {
    const env = { EODHD_PRIVATE_USE: privateUse, VENDOR_DISPLAY_LICENSE: licence, DATA_MODE: "db" };
    const viewers = [
      { tier: "free", preview: false, userId: "free", plan: "free" },
      { tier: "free", preview: false, userId: "passive", plan: "passive" },
      { tier: "paid", preview: false, userId: "plus", plan: "plus" },
    ] as const;
    expect(cells).toEqual(viewers.map((viewer) => canSeeStockData(viewer, env) ? "yes" : "no"));
  }
});
