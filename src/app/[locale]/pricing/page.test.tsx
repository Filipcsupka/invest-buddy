import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
vi.mock("@/data/launch-facts", () => ({ recordStartDate: async () => null }));
import Pricing from "./page";
import Home from "../page";

const original = process.env.WAITLIST;
afterEach(() => { scores.mockReset(); if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

const render = async (locale: string) => renderToStaticMarkup(await Pricing({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ");
/** Any currency sign or code, or a number next to one. */
const money = /€|\$|\bEUR\b|\beuro|\d+(?:[.,]\d+)?\s*(?:EUR|€)/i;

it("is unavailable while WAITLIST is off", async () => {
  delete process.env.WAITLIST;
  await expect(render("en")).rejects.toThrow("NEXT_NOT_FOUND");
});

it.each([["en", "Beta: free while we test. Paid plans later. No prices yet.", "Join the waitlist"], ["sk", "Beta: zadarmo, kým testujeme. Platené plány neskôr. Zatiaľ bez cien.", "Pridať sa na listinu"]])("shows the beta note and the waitlist form without prices in %s", async (locale, lede, button) => {
  process.env.WAITLIST = "on";
  const html = await render(locale);
  expect(text(html)).toContain(lede);
  expect(html).toContain(button);
  expect(html).toContain('name="email"');
  expect(html).not.toContain("<table");
  expect(text(html)).not.toMatch(money);
  expect(html).not.toMatch(/checkout|stripe|subscribe now|lifetime|doživotn/i);
});

it("names no price on the landing page either", async () => {
  process.env.WAITLIST = "on";
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-10-13", stale: false });
  for (const locale of ["en", "sk"]) {
    const home = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
    expect(text(home)).not.toMatch(money);
  }
});
