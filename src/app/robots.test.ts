import { afterEach, expect, it } from "vitest";
import robots from "./robots";
import { siteUrl } from "@/i18n/metadata";

const original = process.env.SITE_NOINDEX;
afterEach(() => { if (original === undefined) delete process.env.SITE_NOINDEX; else process.env.SITE_NOINDEX = original; });

it("allows public pages, closes the API and owner page, and names the sitemap", () => {
  delete process.env.SITE_NOINDEX;
  expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/en/owner-allocation", "/sk/owner-allocation"] }, sitemap: `${siteUrl}/sitemap.xml` });
});

it("blocks the whole site on staging", () => {
  process.env.SITE_NOINDEX = "1";
  expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});
