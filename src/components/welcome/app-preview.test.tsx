import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { AppPreview } from "./app-preview";

const saved = { privateUse: process.env.EODHD_PRIVATE_USE, markets: process.env.MARKETS_VIEWS, insiders: process.env.INSIDERS_PAGE };
afterEach(() => {
  for (const [key, value] of [["EODHD_PRIVATE_USE", saved.privateUse], ["MARKETS_VIEWS", saved.markets], ["INSIDERS_PAGE", saved.insiders]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it.each(["en", "sk"] as const)("lists only the entries the real %s sidebar has, with tier chips and no Soon flag", (locale) => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.INSIDERS_PAGE = "on";
  const html = renderToStaticMarkup(<AppPreview locale={locale} />);
  const t = getWelcomeStoryMessages(locale).areas;
  for (const key of ["dashboard", "stocks", "heatmap", "record", "portfolio", "insiders", "etfResearch", "etfRecord", "indices", "economy", "calendar", "news", "congress", "screener"] as const) {
    expect(html, key).toMatch(new RegExp(`${t.previewItems[key]}<span[^>]*data-chip="plus"`));
  }
  for (const key of ["method", "pricing"] as const) expect(html, key).toMatch(new RegExp(`${t.previewItems[key]}<span[^>]*data-chip="open"`));
  expect(html).toContain(`${t.previewItems.myPortfolio}</li>`);
  expect(html).not.toContain(`${t.previewItems.myPortfolio}<span`);
  for (const gone of ["Watchlist", "Alerts", "CSV export", "Company pages", "Score history", "Sledované tickery", "Upozornenia", "Export do CSV"]) expect(html).not.toContain(gone);
  expect(html).not.toContain("data-chip=\"soon\"");
  expect(html).not.toMatch(/Soon|Čoskoro/);
});

it("shows built data pages as Free account when the private data gate is off", () => {
  process.env.EODHD_PRIVATE_USE = "off";
  process.env.MARKETS_VIEWS = "off";
  process.env.INSIDERS_PAGE = "on";
  const html = renderToStaticMarkup(<AppPreview locale="en" />);
  for (const label of ["Dashboard", "Insider filings", "Track record", "Portfolio"]) expect(html).toMatch(new RegExp(`${label}<span[^>]*data-chip="free"`));
  expect(html).not.toContain("Calendar");
});
