import { afterEach, expect, it } from "vitest";
import robots from "./robots";
import { siteUrl } from "@/i18n/metadata";

const original = { noindex: process.env.SITE_NOINDEX, privateUse: process.env.EODHD_PRIVATE_USE };
afterEach(() => {
  if (original.noindex === undefined) delete process.env.SITE_NOINDEX; else process.env.SITE_NOINDEX = original.noindex;
  if (original.privateUse === undefined) delete process.env.EODHD_PRIVATE_USE; else process.env.EODHD_PRIVATE_USE = original.privateUse;
});

it("allows public pages, closes the API and owner page, and names the sitemap", () => {
  delete process.env.SITE_NOINDEX;
  process.env.EODHD_PRIVATE_USE = "off";
  expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...["en", "sk"].flatMap((locale) => [...["owner-allocation", "indices", "economy", "calendar", "congress", "news", "screener"].map((route) => `/${locale}/${route}`), `/${locale}/owner/`])] }, sitemap: `${siteUrl}/sitemap.xml` });
});

it("keeps private vendor routes out of crawlers when private use is on", () => {
  process.env.EODHD_PRIVATE_USE = "on";
  const rules = robots().rules as { disallow: string[] };
  for (const path of ["/en/dashboard", "/en/scanner", "/en/company", "/sk/etf", "/sk/track-record"]) expect(rules.disallow).toContain(path);
});

it("blocks the whole site on staging", () => {
  process.env.SITE_NOINDEX = "1";
  expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});
