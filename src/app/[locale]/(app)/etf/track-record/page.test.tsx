import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("shows measured sample horizons and the small-sample note in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale }) }));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain(locale === "en" ? "Fewer than 20" : "menej ako 20");
  expect(html).toContain("30");
  expect(html).toContain("50");
});

it("shows no measured outcomes without a database", async () => {
  process.env.DATA_MODE = "db";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en" }) }));
  expect(html).toContain("No ETF outcomes have been measured yet");
  expect(html).not.toContain("SAMPLE DATA");
});
