import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
// Admin is the owner only (a session user id in OWNER_USER_IDS); AUTH off no longer makes every visitor admin.
const owner = vi.hoisted(() => ({ on: true, as: null as null | Record<string, unknown> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => owner.as ?? real.resolveViewer(undefined, null, owner.on) };
});
import Scanner, { generateMetadata } from "./page";

afterEach(() => { owner.on = true; owner.as = null; });

it.each(["en", "sk"])("shows the restored state tally above stock filters (%s)", async (locale) => {
  const oldMode = process.env.DATA_MODE;
  process.env.DATA_MODE = "fixture";
  try {
    const html = renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }));
    expect(html).toContain(locale === "en" ? "Tickers by rule state" : "Tickery podľa stavu pravidiel");
    expect(html.match(/data-state="(setup|watch|wait|ignore|broken|insufficient)"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(html.indexOf('aria-label="' + (locale === "en" ? "Tickers by rule state" : "Tickery podľa stavu pravidiel") + '"')).toBeLessThan(html.indexOf('name="state"'));
  } finally {
    if (oldMode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = oldMode;
  }
});

describe("scanner route", () => {
  it("is visible without the paywall flag, with Paid badges for admin on the advanced filters and the streak", async () => {
    const saved = { PAYWALL: process.env.PAYWALL, AUTH: process.env.AUTH, DATA_MODE: process.env.DATA_MODE };
    process.env.PAYWALL = "off";
    delete process.env.AUTH;
    process.env.DATA_MODE = "fixture";
    owner.on = true;
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
      owner.on = true;
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });

  it("private use on: a non-owner cannot render fixture stock scores with either licence setting", async () => {
    const privateUse = "on";
    const saved = { mode: process.env.DATA_MODE, privateUse: process.env.EODHD_PRIVATE_USE, licence: process.env.VENDOR_DISPLAY_LICENSE };
    owner.on = false;
    process.env.DATA_MODE = "fixture";
    process.env.EODHD_PRIVATE_USE = privateUse;
    try {
      for (const licence of ["on", "off"]) {
        process.env.VENDOR_DISPLAY_LICENSE = licence;
        await expect(Scanner({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) })).rejects.toThrow(/404|NOT_FOUND/);
      }
    } finally {
      owner.on = true;
      for (const [key, value] of [["DATA_MODE", saved.mode], ["EODHD_PRIVATE_USE", saved.privateUse], ["VENDOR_DISPLAY_LICENSE", saved.licence]] as const)
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it.each([
    ["anonymous", { tier: "free", preview: false }],
    ["free", { tier: "free", preview: false, userId: "6", plan: "free" }],
    ["passive", { tier: "free", preview: false, userId: "5", plan: "passive" }],
  ] as const)("db mode: %s never renders stored stock scores, whatever the licence and private-use flags", async (_name, who) => {
    const saved = { mode: process.env.DATA_MODE, privateUse: process.env.EODHD_PRIVATE_USE, licence: process.env.VENDOR_DISPLAY_LICENSE };
    owner.as = who;
    process.env.DATA_MODE = "db";
    try {
      for (const privateUse of ["on", "off"])
        for (const licence of ["on", "off"]) {
          process.env.EODHD_PRIVATE_USE = privateUse;
          process.env.VENDOR_DISPLAY_LICENSE = licence;
          await expect(Scanner({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }), `${privateUse} ${licence}`).rejects.toThrow(/404|NOT_FOUND/);
        }
    } finally {
      for (const [key, value] of [["DATA_MODE", saved.mode], ["EODHD_PRIVATE_USE", saved.privateUse], ["VENDOR_DISPLAY_LICENSE", saved.licence]] as const)
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
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
      const rows = markup.slice(markup.indexOf('data-paywall-candidate="scanner-rows-full"'));
      expect(rows).not.toContain('href="/en/company/AMD"');
      const metadata = await generateMetadata(props);
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBe("/en/stocks");
    } finally {
      if (paywall === undefined) delete process.env.PAYWALL; else process.env.PAYWALL = paywall;
      if (mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = mode;
    }
  });

  it("keeps search and floor parameters in state summary links", async () => {
    const saved = process.env.DATA_MODE;
    process.env.DATA_MODE = "fixture";
    try {
      const markup = renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ q: "NVDA", floor: "off", state: "watch" }) }));
      expect(markup).toContain('href="/en/stocks?q=NVDA&amp;state=watch&amp;floor=off#scanner-group-watch"');
      expect(markup).toMatch(/aria-label="Show \d+ tickers in Watching"/);
      expect(markup).toContain('id="scanner-group-watch"');
    } finally {
      if (saved === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = saved;
    }
  });

  it("uses the displayed rule state for summary counts", async () => {
    const saved = process.env.DATA_MODE;
    process.env.DATA_MODE = "fixture";
    try {
      const markup = renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
      for (const state of ["setup", "watch", "wait", "ignore", "broken"]) {
        const tile = markup.match(new RegExp(`<a[^>]+data-state="${state}"[^>]*>(.*?)</a>`))?.[1];
        const group = markup.match(new RegExp(`id="scanner-group-${state}".*?</summary>`))?.[0];
        expect(tile).toBeDefined();
        expect(group).toBeDefined();
        expect(tile?.match(/kit-count-final">(\d+)/)?.[1]).toBe(group?.match(/groupCount_[^\"]*">(\d+)/)?.[1]);
      }
    } finally {
      if (saved === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = saved;
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
        expect(out[locale]).toContain(`href="/${locale}/stocks?preset=growth-earnings"`);
        expect(out[locale]).toContain('name="preset" value="trend-volume"');
        expect(out[locale]).toContain('aria-current="true"');
        expect(out[locale]).toMatch(/\d+ (of|z) 10/);
        const rowsShown = [...out[locale].matchAll(/<tbody>(.*?)<\/tbody>/g)]
          .flatMap((match) => match[1].split("</tr>").filter((r) => r.includes("data-state=")));
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
