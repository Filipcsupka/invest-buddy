import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });
const props = (locale: string, searchParams?: { assetClass?: string; call?: string; search?: string; issuer?: string; listingRegion?: string }) => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams ?? {}) });

it.each(["en", "sk"])("shows grouped sample funds and labelled filters in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page(props(locale)));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain(`href="/${locale}/etf/VWRA"`);
  expect(html).toContain('name="assetClass"');
  expect(html).toContain('name="call"');
  expect(html).toContain(locale === "en" ? "Unverified" : "Neoverené");
  expect(html).toContain(`href="/${locale}/etf/fund/DE0000000001"`);
  expect(html).toContain('name="search"');
  expect(html).toContain('name="instrumentType"');
  expect(html).toContain('name="listingRegion"');
  expect(html).toContain('name="exchange"');
  expect(html).toContain(locale === "en" ? "Catalog funds" : "Fondy v katalógu");
});

it("filters by class and call without dropping the group heading", async () => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page(props("en", { assetClass: "bond", call: "BUY_ZONE" })));
  expect(html).toContain("Bonds");
  expect(html).toContain("AGGH");
  const picks = html.split('<section')[1];
  expect(picks).not.toContain("IBTS");
  expect(picks).not.toContain("VWRA");
});

it("shows an honest empty state without a database", async () => {
  process.env.DATA_MODE = "db";
  const html = renderToStaticMarkup(await Page(props("en")));
  expect(html).toContain("No ETF research has been recorded yet");
  expect(html).toContain("The ETF catalog has not been loaded yet");
  expect(html).not.toContain("SAMPLE DATA");
});

it("filters the catalog by search and issuer", async () => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page(props("en", { search: "DE0000000001", issuer: "Sample Asset Management" })));
  expect(html).toContain('href="/en/etf/fund/DE0000000001"');
  expect(html).not.toContain('href="/en/etf/fund/DE0000000002"');
});

it("links US listings by encoded listing key", async () => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page(props("en", { search: "S021", listingRegion: "US" })));
  expect(html).toContain('href="/en/etf/fund/NASDAQ%3AS021"');
  expect(html).toContain("Not recorded");
});
