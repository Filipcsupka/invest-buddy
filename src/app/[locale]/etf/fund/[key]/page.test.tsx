import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("shows catalog facts, source and linked pick in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, key: "DE0000000001" }) }));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain("DE0000000001");
  expect(html).toContain(`href="/${locale}/etf/VWRA"`);
  expect(html).toContain("https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra");
});

it("shows no-pick state for a catalog-only fund", async () => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", key: "DE0000000011" }) }));
  expect(html).toContain("No weekly pick is recorded for this fund");
});

it("opens a US listing without an ISIN", async () => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", key: "NASDAQ:S021" }) }));
  expect(html).toContain("NASDAQ:S021");
  expect(html).toContain("United States");
  expect(html).toContain("Not recorded");
});
