import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { companyJsonLd, pageMetadata, siteJsonLd, snippet } from "./metadata";
import { getMessages, locales } from "./index";

const pages = ["", "/dashboard", "/track-record", "/portfolio", "/methodology", "/legal/privacy", "/legal/terms", "/insiders", "/sizing", "/ideas", "/scanner"];
const original = process.env.SITE_NOINDEX;
afterEach(() => { if (original === undefined) delete process.env.SITE_NOINDEX; else process.env.SITE_NOINDEX = original; });

describe("page metadata", () => {
  it("gives every page a canonical and EN, SK and x-default alternates", () => {
    for (const locale of locales) for (const path of pages) {
      const meta = pageMetadata(locale, path, "Title", "Text");
      expect(meta.alternates?.canonical).toBe(`/${locale}${path}`);
      expect(meta.alternates?.languages).toEqual({ "en-GB": `/en${path}`, "sk-SK": `/sk${path}`, "x-default": `/en${path}` });
      expect(meta.openGraph).toMatchObject({ url: `/${locale}${path}`, siteName: "InvestBuddy" });
      expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    }
  });
  it("keeps titles and descriptions unique and within search snippet length", () => {
    for (const locale of locales) {
      const m = getMessages(locale).meta as Record<string, string>;
      const titles = Object.entries(m).filter(([key]) => key.endsWith("Title") && key !== "notFoundTitle").map(([, value]) => value);
      expect(new Set(titles).size).toBe(titles.length);
      for (const title of titles) expect(title.length).toBeLessThanOrEqual(70);
      const descriptions = Object.entries(m).filter(([key]) => key.endsWith("Description") && !key.startsWith("company")).map(([, value]) => value);
      expect(new Set(descriptions).size).toBe(descriptions.length);
      for (const text of descriptions) { expect(text.length).toBeGreaterThanOrEqual(40); expect(text.length).toBeLessThanOrEqual(160); }
    }
  });
  it("shortens long text at a word boundary", () => {
    const long = "word ".repeat(100);
    const out = snippet(long);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
    expect(snippet("short  text")).toBe("short text");
    expect(pageMetadata("en", "/legal/privacy", "Privacy", long).description!.length).toBeLessThanOrEqual(160);
  });
  it("noindexes everything when SITE_NOINDEX is set", () => {
    delete process.env.SITE_NOINDEX;
    expect(pageMetadata("en", "/dashboard", "T", "D").robots).toBeUndefined();
    process.env.SITE_NOINDEX = "1";
    expect(pageMetadata("en", "/dashboard", "T", "D").robots).toEqual({ index: false, follow: false });
  });
  it("every public page builds its metadata with pageMetadata; the owner page is noindex", () => {
    const root = join(process.cwd(), "src/app/[locale]");
    const files: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name === "page.tsx") files.push(path); } };
    walk(root);
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (file.includes("owner-allocation")) expect(source).toContain("index: false");
      else expect(source, file).toContain("pageMetadata(");
    }
  });
});

describe("structured data", () => {
  const banned = /"(aggregateRating|review|reviewRating|ratingValue|rating|offers|price|Product|FinancialProduct|Review)"/;
  it("describes the organisation and site in each language without ratings", () => {
    for (const locale of locales) {
      const items = JSON.parse(JSON.stringify(siteJsonLd(locale))) as { "@type": string; inLanguage?: string }[];
      expect(items.map((item) => item["@type"])).toEqual(["Organization", "WebSite"]);
      expect(items[1].inLanguage).toBe(locale === "en" ? "en-GB" : "sk-SK");
      expect(JSON.stringify(items)).not.toMatch(banned);
    }
  });
  it("describes a company page as a neutral page, dataset and breadcrumb", () => {
    const items = JSON.parse(JSON.stringify(companyJsonLd("sk", "NVDA", "NVIDIA", "2026-10-09", "Text"))) as { "@type": string; dateModified?: string; url?: string }[];
    expect(items.map((item) => item["@type"])).toEqual(["WebPage", "Dataset", "BreadcrumbList"]);
    expect(items[0].dateModified).toBe("2026-10-09");
    expect(items[0].url).toMatch(/\/sk\/company\/NVDA$/);
    expect(JSON.stringify(items)).not.toMatch(banned);
    expect(JSON.stringify(companyJsonLd("en", "ZZZZ", "ZZZZ", null, "Text"))).not.toContain("dateModified");
  });
});
