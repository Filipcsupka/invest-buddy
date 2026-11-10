import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { AppPreview } from "./app-preview";

const saved = process.env.EODHD_PRIVATE_USE;
afterEach(() => { if (saved === undefined) delete process.env.EODHD_PRIVATE_USE; else process.env.EODHD_PRIVATE_USE = saved; });

it.each(["en", "sk"] as const)("lists only the entries the real %s sidebar has, with tier chips and no Soon flag", (locale) => {
  process.env.EODHD_PRIVATE_USE = "on";
  const html = renderToStaticMarkup(<AppPreview locale={locale} />);
  const t = getWelcomeStoryMessages(locale).areas;
  for (const key of ["dashboard", "scanner", "heatmap", "insiders", "record", "portfolio"] as const) {
    expect(html, key).toMatch(new RegExp(`${t.previewItems[key]}<span[^>]*data-chip="plus"`));
  }
  for (const key of ["method", "pricing"] as const) expect(html, key).toMatch(new RegExp(`${t.previewItems[key]}<span[^>]*data-chip="open"`));
  // Areas with no licensed data sit in one quiet group, without a chip.
  for (const key of ["economy", "etfResearch"] as const) {
    expect(html, key).toContain(`${t.previewItems[key]}</li>`);
    expect(html, key).not.toMatch(new RegExp(`${t.previewItems[key]}<span`));
  }
  for (const gone of ["Watchlist", "Alerts", "CSV export", "Indices", "News", "ETF track record", "Company pages", "Score history", "Sledované tickery", "Upozornenia", "Export do CSV", "Indexy", "Správy"]) expect(html).not.toContain(gone);
  expect(html).not.toContain("data-chip=\"soon\"");
  expect(html).not.toMatch(/Soon|Čoskoro/);
});

it("shows built data pages as Free account when the private data gate is off", () => {
  process.env.EODHD_PRIVATE_USE = "off";
  const html = renderToStaticMarkup(<AppPreview locale="en" />);
  for (const label of ["Dashboard", "Insider filings", "Track record", "Portfolio"]) expect(html).toMatch(new RegExp(`${label}<span[^>]*data-chip="free"`));
});
