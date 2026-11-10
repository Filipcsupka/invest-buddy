import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/data/store", () => ({ instrumentUniverse: async () => [], latestScores: async () => ({ rows: [], sample: false, lastUpdated: null, stale: false }) }));
import { proxy } from "./proxy";
import sitemap from "./app/sitemap";

const original = process.env.WAITLIST;
afterEach(() => { if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

it.each(["en", "sk"])("opens /%s/pricing whatever WAITLIST says", async (locale) => {
  for (const value of [undefined, "off", "on"]) {
    if (value === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = value;
    expect((await proxy(new NextRequest(`https://example.com/${locale}/pricing`))).status).toBe(200);
  }
});

it("lists pricing in the sitemap in both locales whatever WAITLIST says", async () => {
  for (const value of [undefined, "on"]) {
    if (value === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = value;
    const urls = (await sitemap()).map((e) => e.url).filter((u) => u.endsWith("/pricing"));
    expect(urls.sort()).toEqual([expect.stringMatching(/\/en\/pricing$/), expect.stringMatching(/\/sk\/pricing$/)]);
  }
});

it("lists the privacy, terms and disclaimer pages in both locales regardless of flags", async () => {
  const urls = (await sitemap()).map((e) => e.url);
  for (const doc of ["privacy", "terms", "disclaimer"]) {
    for (const locale of ["en", "sk"]) expect(urls.some((u) => u.endsWith(`/${locale}/legal/${doc}`))).toBe(true);
  }
});
