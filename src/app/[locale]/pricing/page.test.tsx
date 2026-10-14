import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";
import { FREE_LIMITS, PRICE_VARIANTS, yearlyTotalEur } from "@/config/plans";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
vi.mock("@/data/launch-facts", () => ({ recordStartDate: async () => null }));
import Pricing from "./page";
import Home from "../page";

const original = process.env.WAITLIST;
afterEach(() => { scores.mockReset(); if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

const render = async (locale: string, v?: string) => renderToStaticMarkup(await Pricing({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(v ? { v } : {}) }));
/** Every "<number> EUR" amount in the page text, normalised to a dot decimal. */
const amounts = (html: string) => [...html.replace(/<[^>]+>/g, " ").matchAll(/(\d+(?:[.,]\d+)?)\s*EUR/g)].map((m) => m[1].replace(",", ".")).filter((n) => Number(n) > 0);

it("is unavailable while WAITLIST is off", async () => {
  delete process.env.WAITLIST;
  await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");
});

it.each([["en", "Join the waitlist", "Planned price"], ["sk", "Pridať sa na listinu", "Plánovaná cena"]])("shows planned price, table and waitlist form in %s", async (locale, button, planned) => {
  process.env.WAITLIST = "on";
  const html = await render(locale);
  expect(html).toContain(button);
  expect(html).toContain(planned);
  expect(html).toContain('name="email"');
  expect(html).toContain('name="consentLaunch"');
  expect(html).toContain("<table");
  expect(html).toContain(String(FREE_LIMITS.scoreHistoryDays));
  expect(html).toContain(String(FREE_LIMITS.scannerRows));
  expect(html).not.toMatch(/checkout|stripe|subscribe now|lifetime|doživotn|registered users|zaregistrovaných/i);
});

it("shows the same prices in both locales", async () => {
  process.env.WAITLIST = "on";
  for (const v of ["a", "b"] as const) {
    const en = amounts(await render("en", v));
    const sk = amounts(await render("sk", v));
    expect(en.map(Number)).toEqual(sk.map(Number));
    expect(en.map(Number).sort((x, y) => x - y)).toEqual([PRICE_VARIANTS[v].monthlyEur, yearlyTotalEur(v)].sort((a, b) => a - b));
  }
});

it("shows one price level on a page and falls back to the default for an unknown variant", async () => {
  process.env.WAITLIST = "on";
  const a = amounts(await render("en", "a"));
  const b = amounts(await render("en", "b"));
  expect(a).not.toEqual(b);
  expect(amounts(await render("en", "zzz"))).toEqual(a);
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-10-13", stale: false });
  const home = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale: "en" }) }));
  // The landing page names no price at all, so it cannot disagree with this one.
  expect(amounts(home)).toEqual([]);
});
