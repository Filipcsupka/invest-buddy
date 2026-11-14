import { vi } from "vitest";
const access = vi.hoisted(() => ({ owner: false, vendor: true, scores: true, gaps: null as null | Record<string, "fx" | "currency" | "missing"> }));
vi.mock("@/db/etf-catalog", async (original) => {
  const real = await original<typeof import("@/db/etf-catalog")>();
  return { ...real, etfCatalogList: async (...args: Parameters<typeof real.etfCatalogList>) => {
    const list = await real.etfCatalogList(...args);
    const gaps = access.gaps;
    return gaps ? { ...list, funds: list.funds.map((fund) => gaps[fund.listingKey] ? { ...fund, facts: { ...fund.facts!, aumEurM: null, aumGap: gaps[fund.listingKey] } } : fund) } : list;
  } };
});
vi.mock("@/components/etf/owner", async (original) => ({ ...await original<typeof import("@/components/etf/owner")>(),
  requireEtfScreeningAccess: async () => undefined, etfOwnerView: async () => access.vendor, etfScoreView: async () => access.scores }));
vi.mock("@/viewer/get-viewer", async (original) => ({ ...await original<typeof import("@/viewer/get-viewer")>(),
  getViewer: async () => access.owner ? { tier: "admin", preview: false, userId: "owner", owner: true } : { tier: "free", preview: false, userId: "passive", plan: "passive" } }));
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it } from "vitest";
import Page from "./page";

const originalMode = process.env.DATA_MODE;
beforeEach(() => { access.owner = false; access.vendor = true; access.scores = true; access.gaps = null; });
afterEach(() => { process.env.DATA_MODE = originalMode; });
type Search = Record<string, string>;
const props = (locale: string, searchParams?: Search) => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams ?? {}) });
const render = async (locale: string, searchParams?: Search) => renderToStaticMarkup(await Page(props(locale, searchParams)));
const section = (html: string, id: string) => html.slice(html.indexOf(`aria-labelledby="${id}"`), html.indexOf("</section>", html.indexOf(`aria-labelledby="${id}"`)));
const MODEL_OUTPUT = /Buy zone|Nákupná zóna|Avoid|Vyhnúť sa|BUY_ZONE|AVOID|Conviction|Presvedčenie|This week|Tipy na tento týždeň|Model research notes|Poznámky výskumného modelu|href="\/(en|sk)\/etf\/VWRA"|track-record/;

it.each(["en", "sk"])("opens on the rule rating for a customer in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = await render(locale);
  const en = locale === "en";
  expect(html).toContain(en ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain('data-area="etf"');
  // Order: rating overview, highest rated, then the catalog.
  const strip = html.indexOf('aria-labelledby="etf-rating"'), top = html.indexOf('aria-labelledby="etf-top"'), catalog = html.indexOf('aria-labelledby="etf-catalog"');
  expect(strip).toBeGreaterThan(0);
  expect(strip).toBeLessThan(top);
  expect(top).toBeLessThan(catalog);
  expect(section(html, "etf-rating")).toContain(en ? "3 of 38 ETFs rated (8 %)" : "Hodnotených 3 z 38 ETF (8 %)");
  expect(section(html, "etf-rating")).toContain(`href="/${locale}/etf?band=mostlyMet#etf-catalog"`);
  expect(section(html, "etf-top")).toContain(en ? "Highest rated" : "Najvyššie hodnotené");
  expect(section(html, "etf-top")).toContain(`href="/${locale}/etf/fund/DE0000000002"`);
  expect(section(html, "etf-top")).toContain('data-band="mostlyMet"');
  for (const name of ["search", "band", "evidence", "assetClass", "category", "ter", "aum", "distribution", "instrumentType", "listingRegion", "exchange", "issuer", "ucits", "shortlist", "enriched", "sort"]) expect(html).toContain(`name="${name}"`);
  expect(html).toContain('value="ret1y_desc"');
  expect(html).toContain(en ? "AUM (EUR m)" : "AUM (mil. EUR)");
  expect(html).toContain(en ? "3y return p.a." : "Výnos 3 r. p. a.");
  expect(html).toContain(en ? "Top 10 weight" : "Váha top 10");
  expect(html).toContain(`href="/${locale}/etf/fund/DE0000000001"`);
  expect(html).toContain(en ? "Catalog funds" : "Fondy v katalógu");
  expect(html).toContain('role="region"');
  expect(html).not.toContain('name="call"');
  expect(html).not.toMatch(MODEL_OUTPUT);
});

it("ignores the call parameter for customers and keeps it out of page links", async () => {
  process.env.DATA_MODE = "fixture";
  const plain = await render("en", { assetClass: "bond" });
  for (const call of ["BUY_ZONE", "WATCH", "AVOID", "bogus"]) {
    const withCall = await render("en", { assetClass: "bond", call });
    expect(withCall).toBe(plain);
    expect(withCall).not.toContain("call=");
    expect(withCall).not.toMatch(MODEL_OUTPUT);
  }
});

it("shows the model research table and its call filter to the owner only", async () => {
  process.env.DATA_MODE = "fixture";
  access.owner = true;
  const html = await render("en", { assetClass: "bond", call: "BUY_ZONE" });
  const research = section(html, "etf-picks");
  expect(research).toContain("Model research notes");
  expect(research).toContain("Owner only");
  expect(research).toContain('name="call"');
  expect(research).toContain("Bonds");
  expect(research).toContain("AGGH");
  expect(research).not.toContain("IBTS");
  expect(research).not.toContain("VWRA");
  expect(html).toContain('href="/en/etf/track-record"');
  // The research section sits below the catalog.
  expect(html.indexOf('aria-labelledby="etf-picks"')).toBeGreaterThan(html.indexOf('aria-labelledby="etf-catalog"'));
});

it("shows honest empty states without a database", async () => {
  process.env.DATA_MODE = "db";
  let html = await render("en");
  expect(html).toContain("No current rating run is stored yet.");
  expect(html).toContain("No fund has a current rating yet.");
  expect(html).toContain("The ETF catalog has not been loaded yet");
  expect(html).not.toContain("SAMPLE DATA");
  expect(html).not.toContain("No ETF research has been recorded yet");
  access.owner = true;
  html = await render("en");
  expect(html).toContain("No ETF research has been recorded yet");
});

it("hides vendor columns, filters and sorts without vendor access", async () => {
  process.env.DATA_MODE = "fixture";
  access.vendor = false;
  const html = await render("en", { category: "Global Equity", sort: "ret1y_desc" });
  for (const label of ["1y return", "3y return p.a.", "Volatility 1y", "Top 10 weight", "Holdings"]) expect(html).not.toContain(`>${label}</th>`);
  expect(html).not.toContain('name="category"');
  expect(html).not.toContain('value="ret1y_desc"');
  expect(html).toContain("AUM (EUR m)");
  expect(html).toContain('<option value="rating" selected="">Rating</option>');
});

it("filters the catalog by search and issuer", async () => {
  process.env.DATA_MODE = "fixture";
  const html = await render("en", { search: "DE0000000001", issuer: "Sample Asset Management" });
  expect(section(html, "etf-catalog")).toContain('href="/en/etf/fund/DE0000000001"');
  expect(section(html, "etf-catalog")).not.toContain('href="/en/etf/fund/DE0000000002"');
});

it("filters the catalog by band and keeps the filter on pagination links", async () => {
  process.env.DATA_MODE = "fixture";
  const html = await render("en", { band: "notRated", instrumentType: "all" });
  expect(html).toContain("Funds: 37");
  expect(section(html, "etf-catalog")).not.toContain('href="/en/etf/fund/DE0000000001"');
  const rated = await render("en", { band: "mostlyMet" });
  expect(rated).toContain("Funds: 3");
});

it("links US listings by encoded listing key and marks gaps", async () => {
  process.env.DATA_MODE = "fixture";
  const html = await render("en", { search: "S021", listingRegion: "US" });
  expect(html).toContain('href="/en/etf/fund/NASDAQ%3AS021"');
  expect(html).toContain('<span class="visually-hidden">Not recorded</span>');
});

it.each([["en", "No current EUR exchange rate", "Currency not stated"], ["sk", "Chýba aktuálny kurz EUR", "Mena neuvedená"]] as const)("names why EUR AUM is blank in %s", async (locale, fx, currency) => {
  process.env.DATA_MODE = "fixture";
  access.gaps = { DE0000000002: "fx", DE0000000003: "currency" };
  const html = section(await render(locale), "etf-catalog");
  expect(html).toContain(`<span class="visually-hidden">${fx}</span>`);
  expect(html).toContain(`<span class="visually-hidden">${currency}</span>`);
});
