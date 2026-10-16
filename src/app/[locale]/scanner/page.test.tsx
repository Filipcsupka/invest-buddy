import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Scanner, { generateMetadata } from "./page";

describe("scanner route", () => {
  it("is visible without the paywall flag, with Paid badges for admin on the advanced filters and the streak", async () => {
    const saved = { PAYWALL: process.env.PAYWALL, AUTH: process.env.AUTH, DATA_MODE: process.env.DATA_MODE };
    process.env.PAYWALL = "off";
    delete process.env.AUTH;
    process.env.DATA_MODE = "fixture";
    try {
      for (const locale of ["en", "sk"]) {
        const markup = renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }));
        expect(markup).toContain('data-tier-badge="scanner-filters-advanced"');
        expect(markup).toContain('data-tier-badge="scanner-streak"');
        expect(markup).toContain('name="min"');
        expect(markup).toContain('name="sort"');
        expect(markup).not.toContain("data-tier-lock");
      }
    } finally {
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });

  describe("free viewer", () => {
    const saved = { PAYWALL: process.env.PAYWALL, AUTH: process.env.AUTH, DATA_MODE: process.env.DATA_MODE };
    beforeEach(() => { process.env.PAYWALL = "on"; process.env.AUTH = "on"; process.env.DATA_MODE = "fixture"; });
    afterEach(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
    const render = async (searchParams: Record<string, string>, locale = "en") => renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams) }));

    it("sees lock cards for advanced filters and streak, and no paid controls", async () => {
      const markup = await render({});
      expect(markup).toContain('data-tier-lock="scanner-filters-advanced"');
      expect(markup).toContain('data-tier-lock="scanner-streak"');
      expect(markup).not.toContain("data-tier-badge");
      for (const name of ["min", "max", "source", "held", "sort"]) expect(markup).not.toContain(`name="${name}"`);
    });

    it("keeps search, state, sector, floor toggle, rule presets and every ticker", async () => {
      const markup = await render({});
      for (const name of ["q", "state", "sector"]) expect(markup).toContain(`name="${name}"`);
      expect(markup).toContain("/en/scanner?floor=off");
      expect(markup).toContain('href="/en/scanner?preset=trend-volume"');
      expect(markup).toContain('data-paywall-candidate="scanner-rows-full"');
      expect(markup).not.toContain("data-tier-lock=\"scanner-rows-full\"");
      expect(markup).toContain('href="/en/company/NVDA"');
      expect(await render({ q: "NVDA" })).not.toContain('href="/en/company/AMD"');
    });

    it("shows the change presets as locked, not as links", async () => {
      const markup = await render({});
      expect(markup).not.toContain("preset=newly-meeting");
      expect(markup).not.toContain("preset=rules-lost");
      expect(markup).toContain("Newly meeting rules");
      expect(markup).toContain("In the paid tier");
    });

    it("ignores paid filters in the URL", async () => {
      const plain = await render({});
      const markup = await render({ min: "25", f: "10", source: "discovery", held: "yes", sort: "ticker", preset: "rules-lost" });
      expect(markup).toBe(plain);
    });
  });

  it("renders a filtered fixture row and marks query URLs noindex", async () => {
    const paywall = process.env.PAYWALL;
    const mode = process.env.DATA_MODE;
    process.env.PAYWALL = "on";
    process.env.DATA_MODE = "fixture";
    try {
      const props = { params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ q: "NVDA" }) };
      const markup = renderToStaticMarkup(await Scanner(props));
      expect(markup).toContain('name="q"');
      expect(markup).toContain('value="NVDA"');
      expect(markup).toContain('data-paywall-candidate="scanner-rows-full"');
      expect(markup).toContain('href="/en/company/NVDA"');
      expect(markup).not.toContain('href="/en/company/AMD"');
      const metadata = await generateMetadata(props);
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBe("/en/scanner");
    } finally {
      if (paywall === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = paywall;
      if (mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = mode;
    }
  });

  it("shows the streak column and presets with rule counts, and keeps a status on every row, EN and SK", async () => {
    const paywall = process.env.PAYWALL;
    const mode = process.env.DATA_MODE;
    process.env.PAYWALL = "on";
    process.env.DATA_MODE = "fixture";
    try {
      const out: Record<string, string> = {};
      for (const locale of ["en", "sk"]) {
        out[locale] = renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ preset: "trend-volume" }) }));
        expect(out[locale]).toContain(`href="/${locale}/scanner?preset=growth-earnings"`);
        expect(out[locale]).toContain('name="preset" value="trend-volume"');
        expect(out[locale]).toContain('aria-current="true"');
        expect(out[locale]).toMatch(/\d+ (of|z) 10/);
        const body = out[locale].match(/<tbody>.*<\/tbody>/)?.[0] ?? "";
        const rowsShown = body.split("</tr>").filter((r) => r.includes("<tr"));
        expect(rowsShown.length).toBeGreaterThan(0);
        for (const r of rowsShown) expect(r).toMatch(/\d+ (of|z) 10/);
      }
      expect(out.en).toContain("Rules met");
      expect(out.en).toContain("3 rules");
      expect(out.sk).toContain("Splnené pravidlá");
      expect(out.sk).toContain("3 pravidlá");
      expect(out.en).toContain("Rules lost this week");
      expect(out.sk).toContain("Pravidlá stratené za týždeň");
    } finally {
      if (paywall === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = paywall;
      if (mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = mode;
    }
  });
});
