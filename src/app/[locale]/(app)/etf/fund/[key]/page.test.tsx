import { vi } from "vitest";
vi.mock("@/components/etf/owner", async (original) => ({ ...await original<typeof import("@/components/etf/owner")>(), requireEtfScreeningAccess: async () => undefined }));
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";
import { sampleEtfCatalog } from "@/data/etf-fixtures";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("shows catalog facts, source and linked pick in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, key: "DE0000000001" }) }));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain("DE0000000001");
  expect(html).toContain(`href="/${locale}/etf/VWRA"`);
  expect(html).toContain(locale === "en" ? "Issuer page" : "Stránka správcu");
});

it.each(["en", "sk"])("hides vendor-host URLs on a fund page (%s)", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const fund = sampleEtfCatalog[0];
  const previous = fund.sourceUrl;
  fund.sourceUrl = "https://www.eodhd.com/financial-apis/secret-source";
  try {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, key: fund.listingKey }) }));
    expect(html).not.toContain("eodhd.com");
    expect(html).toContain(locale === "en" ? "Stored provider data" : "Uložené údaje dodávateľa");
  } finally { fund.sourceUrl = previous; }
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
