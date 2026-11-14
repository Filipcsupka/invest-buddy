import { vi } from "vitest";
const scoreView = vi.hoisted(() => vi.fn(() => false));
const ownerView = vi.hoisted(() => vi.fn(() => true));
const pickOwnerView = vi.hoisted(() => vi.fn(() => true));
const pickRead = vi.hoisted(() => vi.fn());
vi.mock("@/components/etf/owner", async (original) => ({ ...await original<typeof import("@/components/etf/owner")>(), requireEtfScreeningAccess: async () => undefined, etfScoreView: scoreView, etfOwnerView: ownerView, etfPickOwnerView: pickOwnerView }));
vi.mock("@/db/etf", async (original) => { const real = await original<typeof import("@/db/etf")>(); return { ...real, etfDetail: (...args: Parameters<typeof real.etfDetail>) => { pickRead(...args); return real.etfDetail(...args); } }; });
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Page from "./page";
import { sampleEtfCatalog } from "@/data/etf-fixtures";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; scoreView.mockReturnValue(false); ownerView.mockReturnValue(true); pickOwnerView.mockReturnValue(true); pickRead.mockClear(); });

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

it.each(["en", "sk"])("shows the scored rules and methodology in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  scoreView.mockReturnValue(true);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, key: "DE0000000001" }) }));
  expect(html).toContain('id="fund-rules"');
  expect(html).toContain(locale === "en" ? "How the rating was calculated" : "Výpočet hodnotenia");
  expect(html).toContain(locale === "en" ? "Total expense ratio" : "Celkové náklady");
  expect(html).toContain(`href="/${locale}/methodology"`);
  expect(html).toContain(locale === "en" ? "UCITS hint (unconfirmed)" : "Náznak UCITS (nepotvrdený)");
});

it.each(["en", "sk"])("keeps weekly pick data out of nonowner HTML and the route payload in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  pickOwnerView.mockReturnValue(false);
  scoreView.mockReturnValue(true);
  const payload = await Page({ params: Promise.resolve({ locale, key: "DE0000000001" }) });
  const html = renderToStaticMarkup(payload);
  expect(html).not.toContain('id="fund-pick"');
  expect(html).not.toContain('id="fund-history"');
  expect(html).not.toContain('id="fund-outcomes"');
  expect(html).toContain('id="fund-vendor"');
  expect(html).not.toContain(`href="/${locale}/etf/VWRA"`);
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(payload, (_key, value: unknown) => {
    if (value && typeof value === "object") { if (seen.has(value)) return undefined; seen.add(value); }
    return value;
  });
  expect(serialized).not.toContain("fund-pick");
  expect(serialized).not.toContain(`/${locale}/etf/VWRA`);
  expect(pickRead).not.toHaveBeenCalled();
});
