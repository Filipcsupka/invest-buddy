import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { AppPreview } from "./app-preview";

const saved = process.env.EODHD_PRIVATE_USE;
afterEach(() => { if (saved === undefined) delete process.env.EODHD_PRIVATE_USE; else process.env.EODHD_PRIVATE_USE = saved; });

it.each(["en", "sk"] as const)("uses tier chips for built %s pages and Soon only for unbuilt tools", (locale) => {
  process.env.EODHD_PRIVATE_USE = "on";
  const html = renderToStaticMarkup(<AppPreview locale={locale} />);
  const t = getWelcomeStoryMessages(locale).areas;
  for (const key of ["dashboard", "scanner", "heatmap", "company", "history", "insiders", "record", "etfResearch", "etfRecord", "indices", "economy", "news"] as const) {
    expect(html, key).toContain(`${t.previewItems[key]}<span`);
    expect(html, key).toMatch(new RegExp(`${t.previewItems[key]}<span[^>]*data-chip="plus"`));
  }
  for (const key of ["watchlist", "alerts", "export"] as const) {
    expect(html, key).toMatch(new RegExp(`${t.previewItems[key]}<span[^>]*data-chip="soon"`));
  }
});

it("shows built data pages as Free account when the private data gate is off", () => {
  process.env.EODHD_PRIVATE_USE = "off";
  const html = renderToStaticMarkup(<AppPreview locale="en" />);
  for (const label of ["Dashboard", "Insiders", "Track record", "ETF research"]) expect(html).toMatch(new RegExp(`${label}<span[^>]*data-chip="free"`));
  expect(html).toMatch(/Score history<span[^>]*data-chip="plus"/);
});
