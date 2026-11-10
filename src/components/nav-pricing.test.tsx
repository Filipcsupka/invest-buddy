import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/data/store", () => ({ latestScores: async () => ({ rows: [], sample: false, lastUpdated: null, stale: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));
import { Nav } from "./nav";

const original = process.env.WAITLIST;
afterEach(() => { if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

it.each(["en", "sk"] as const)("always lists pricing, whatever WAITLIST says (%s)", (locale) => {
  for (const value of [undefined, "off", "on"]) {
    if (value === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = value;
    expect(renderToStaticMarkup(<Nav locale={locale} />)).toContain(`href="/${locale}/pricing"`);
  }
});
