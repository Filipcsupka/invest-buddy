import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });
const props = (locale: string, searchParams?: { assetClass?: string; call?: string }) => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams ?? {}) });

it.each(["en", "sk"])("shows grouped sample funds and labelled filters in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page(props(locale)));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain(`href="/${locale}/etf/VWRA"`);
  expect(html).toContain('name="assetClass"');
  expect(html).toContain('name="call"');
  expect(html).toContain(locale === "en" ? "Unverified" : "Neoverené");
});

it("filters by class and call without dropping the group heading", async () => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page(props("en", { assetClass: "bond", call: "BUY_ZONE" })));
  expect(html).toContain("Bonds");
  expect(html).toContain("AGGH");
  expect(html).not.toContain("IBTS");
  expect(html).not.toContain("VWRA");
});

it("shows an honest empty state without a database", async () => {
  process.env.DATA_MODE = "db";
  const html = renderToStaticMarkup(await Page(props("en")));
  expect(html).toContain("No ETF research has been recorded yet");
  expect(html).not.toContain("SAMPLE DATA");
});
