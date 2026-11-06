import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("shows the ETF card sections and measurement in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, symbol: "VWRA" }) }));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain(locale === "en" ? "Thesis" : "Téza");
  expect(html).toContain(locale === "en" ? "Entry zone" : "Vstupná zóna");
  expect(html).toContain(locale === "en" ? "Evidence" : "Zdroje");
  expect(html).toContain("SPY");
});
