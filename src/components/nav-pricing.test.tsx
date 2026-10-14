import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/data/store", () => ({ latestScores: async () => ({ rows: [], sample: false, lastUpdated: null, stale: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));
import { Nav } from "./nav";

const original = process.env.WAITLIST;
afterEach(() => { if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

it.each(["en", "sk"] as const)("shows the pricing link only while WAITLIST is on (%s)", (locale) => {
  delete process.env.WAITLIST;
  expect(renderToStaticMarkup(<Nav locale={locale} />)).not.toContain(`href="/${locale}/pricing"`);
  process.env.WAITLIST = "on";
  expect(renderToStaticMarkup(<Nav locale={locale} />)).toContain(`href="/${locale}/pricing"`);
});
