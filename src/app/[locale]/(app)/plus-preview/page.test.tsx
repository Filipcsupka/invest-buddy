import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import PlusPreview from "./page";

it.each([["en", "Part of Plus", "SAMPLE preview", "Create free account"], ["sk", "Súčasť Plus", "UKÁŽKA", "Vytvoriť bezplatný účet"]] as const)("shows the %s Plus preview without live data", async (locale, title, sample, create) => {
  const html = renderToStaticMarkup(await PlusPreview({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ page: "dashboard" }) }));
  expect(html).toContain(title);
  expect(html).toContain(sample);
  expect(html).toContain(create);
  expect(html).toContain(locale === "en" ? "Dashboard" : "Prehľad");
  expect(html).toContain(locale === "en" ? "14-day trial" : "Skúšobná doba 14 dní");
  expect(html).toContain(`href="/${locale}/sign-in?next=`);
  expect(html).not.toMatch(/soon|čoskoro|licen[cs]/i);
});

it("does not echo unknown page query values", async () => {
  const html = renderToStaticMarkup(await PlusPreview({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ page: "<script>" }) }));
  expect(html).not.toContain("&lt;script&gt;");
  expect(html).toContain("Part of Plus");
});

it("names the ETF track record separately from ETF research", async () => {
  const html = renderToStaticMarkup(await PlusPreview({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ page: "etf/track-record" }) }));
  expect(html).toContain("ETF track record");
  expect(html).toContain("recorded ETF research results");
});
