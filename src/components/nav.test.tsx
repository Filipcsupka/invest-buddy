import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));
import { Footer, Nav } from "./nav";

const originalMode = process.env.DATA_MODE;
const originalAdvice = process.env.ADVICE_OUTPUT;
afterEach(() => { scores.mockReset(); process.env.DATA_MODE = originalMode; if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });

it.each(["en", "sk"] as const)("hides sizing navigation while advice is off (%s)", (locale) => {
  process.env.ADVICE_OUTPUT = "off";
  expect(renderToStaticMarkup(<Nav locale={locale} />)).not.toContain(`href="/${locale}/sizing"`);
  process.env.ADVICE_OUTPUT = "on";
  expect(renderToStaticMarkup(<Nav locale={locale} />)).toContain(`href="/${locale}/sizing"`);
});

it.each(["en", "sk"] as const)("links the scanner and keeps the heat map link (%s)", (locale) => {
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  expect(html).toContain(`href="/${locale}/dashboard"`);
  expect(html).toContain(locale === "en" ? "Stock screen (data jobs and judge)" : "Akciový skríning (dátové úlohy a posúdenie)");
  expect(html).toContain(`href="/${locale}/scanner"`);
  expect(html).toContain(`href="/${locale}/heatmap"`);
  expect(html).toContain(`href="/${locale}/etf"`);
  expect(html).toContain(`href="/${locale}/etf/track-record"`);
  expect(html).toContain(locale === "en" ? "Stocks" : "Akcie");
});

it.each(["en", "sk"])("keeps the shared footer free of fixture labels in db mode (%s)", async (locale) => {
  process.env.DATA_MODE = "db";
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const html = renderToStaticMarkup(await Footer({ locale: locale as "en" | "sk" }));
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE|sample data|ukážkových údajoch/i);
});

it.each([["en", "Collapse sidebar"], ["sk", "Zbaliť bočný panel"]] as const)("renders a labelled sidebar collapse button (%s)", (locale, label) => {
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  expect(html).toMatch(new RegExp(`<button[^>]*class="side-toggle"[^>]*aria-controls="side-panel"[^>]*aria-label="${label}"`));
  expect(html).toContain(`title="${label}"`);
});
