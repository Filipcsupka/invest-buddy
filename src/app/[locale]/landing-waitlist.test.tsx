import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";

const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
vi.mock("@/data/launch-facts", () => ({ recordStartDate: async () => "2026-10-05" }));
import Home from "./page";

const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
const original = process.env.WAITLIST;
afterEach(() => { scores.mockReset(); if (original === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = original; });

const BANNED = /guarantee|beat the market|probability|outperform|limited time|act now|last chance|hurry|zaručen|poraziť trh|pravdepodobnosť|obmedzený čas|nenechajte si ujsť/i;

it.each(["en", "sk"])("hides the waitlist section while WAITLIST is off (%s)", async (locale) => {
  delete process.env.WAITLIST;
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const html = renderToStaticMarkup(await Home(props(locale)));
  expect(html).not.toContain('id="waitlist"');
  expect(html).not.toContain('name="consent"');
  expect(html).not.toContain(`/${locale}/pricing`);
});

it.each([["en", "Join the waitlist", "tickers scored", "Last score", "Record starts"], ["sk", "Pridať sa do poradovníka", "Ohodnotených tikerov", "Posledné skóre", "Záznam začína"]])("shows form, hero CTA and facts with WAITLIST on (%s)", async (locale, cta, tickers, last, start) => {
  process.env.WAITLIST = "on";
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-10-13", stale: false });
  const html = renderToStaticMarkup(await Home(props(locale)));
  expect(html).toContain('id="waitlist"');
  expect(html).toContain('href="#waitlist"');
  expect(html).toContain(cta);
  expect(html).toContain('name="email"');
  expect(html).toContain('name="consent"');
  expect(html).toContain('name="website"');
  expect(html).toContain(tickers);
  expect(html).toContain(last);
  expect(html).toContain(start);
  expect(html).toContain(`/${locale}/pricing`);
  expect(html).toContain(`/${locale}/methodology`);
  expect(html).toContain(`/${locale}/track-record`);
  expect(html).not.toMatch(BANNED);
});

it("omits facts it cannot back when there is no data", async () => {
  process.env.WAITLIST = "on";
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const html = renderToStaticMarkup(await Home(props("en")));
  expect(html).not.toMatch(/tickers scored|Last score|Record starts/);
});

it("shows no facts on sample data", async () => {
  process.env.WAITLIST = "on";
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: true, lastUpdated: "2026-10-13", stale: false });
  const html = renderToStaticMarkup(await Home(props("en")));
  expect(html).not.toMatch(/tickers scored|Record starts/);
});
