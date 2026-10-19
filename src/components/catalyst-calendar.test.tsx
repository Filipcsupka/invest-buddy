import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MacroEvent } from "@/data/macro-calendar";
import { CatalystCalendar } from "./catalyst-calendar";

const macro: MacroEvent[] = [
  { date: "2026-10-28", kind: "FOMC", label: "FOMC decision" },
  { date: "2026-11-06", kind: "NFP", label: "Jobs report (October)" },
  { date: "2026-11-10", kind: "CPI", label: "CPI (October)" },
  { date: "2026-12-10", kind: "CPI", label: "CPI (November)" },
  { date: "2026-10-01", kind: "PPI", label: "PPI (September)" },
  { date: "2026-10-30", kind: "EARNINGS", label: "Mega-cap earnings" },
];

// Public wording gate (docs/wording-gate.md, ADR-001): no action words, sizes, amounts, plans or advice-style urgency.
const BANNED = /\b(?:buy|sell|add|start|reduce|wait|hold|position|target|EUR|€|signal|trigger|consider|should)\b|prikúp|kúp|predaj|predať|zníž|otvoriť|pozíci|počkaj|signál|cieľov|odporúča/i;
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("CatalystCalendar", () => {
  it("lists official macro dates within 30 days, sorted, with the official source line", () => {
    const html = renderToStaticMarkup(<CatalystCalendar locale="en" today="2026-10-19" macro={macro} />);
    expect(html).toContain('dateTime="2026-10-28"');
    expect(html).toContain("Fed rate decision");
    expect(html).toContain("in 9 days");
    expect(html.indexOf("2026-10-28")).toBeLessThan(html.indexOf("2026-11-10"));
    expect(html).toContain("US Bureau of Labor Statistics and Federal Reserve schedules");
    // Past, beyond the window, and non-official kinds stay out.
    expect(html).not.toContain("2026-12-10");
    expect(html).not.toContain("2026-10-01");
    expect(html).not.toContain("2026-10-30");
    expect(html).not.toContain("Earnings report");
    expect(html).not.toContain("Alpha Vantage");
  });

  it("adds the earnings date with its time of day and source when one is passed", () => {
    const html = renderToStaticMarkup(<CatalystCalendar locale="en" today="2026-10-19" macro={macro} earnings={{ date: "2026-10-28", timeOfDay: "post-market" }} />);
    expect(html).toContain('data-kind="earnings"');
    expect(html).toContain("Earnings report");
    expect(html).toContain("after the market closes");
    expect(html).toContain("Alpha Vantage earnings calendar");
    // Same day: earnings first.
    expect(html.indexOf('data-kind="earnings"')).toBeLessThan(html.indexOf('data-kind="FOMC"'));
  });

  it("uses Slovak text and plural forms", () => {
    const html = renderToStaticMarkup(<CatalystCalendar locale="sk" today="2026-10-24" macro={macro} earnings={{ date: "2026-10-25", timeOfDay: "pre-market" }} />);
    expect(html).toContain("Nadchádzajúce termíny");
    expect(html).toContain("Rozhodnutie Fedu o sadzbách");
    expect(html).toContain("zajtra");
    expect(html).toContain("pred otvorením trhu");
    expect(html).toContain("o 4 dni");
    expect(html).toContain("o 13 dní");
    expect(renderToStaticMarkup(<CatalystCalendar locale="sk" today="2026-10-28" macro={macro} />)).toContain("dnes");
  });

  it("renders the earnings date alone, and nothing without any date in range", () => {
    const only = renderToStaticMarkup(<CatalystCalendar locale="en" today="2027-03-01" macro={macro} earnings={{ date: "2027-04-20", timeOfDay: null }} />);
    expect(only).toContain("Earnings report");
    expect(only).not.toContain("Bureau of Labor Statistics");
    expect(renderToStaticMarkup(<CatalystCalendar locale="en" today="2027-03-01" macro={macro} />)).toBe("");
    expect(renderToStaticMarkup(<CatalystCalendar locale="en" today="2027-03-01" macro={macro} earnings={{ date: "2027-02-20", timeOfDay: null }} />)).toBe("");
  });

  it.each(["en", "sk"] as const)("passes the public wording gate in %s", (locale) => {
    for (const timeOfDay of ["pre-market", "post-market", null] as const) {
      const html = renderToStaticMarkup(<CatalystCalendar locale={locale} today="2026-10-19" macro={macro} earnings={{ date: "2026-10-20", timeOfDay }} />);
      expect(text(html)).not.toMatch(BANNED);
      expect(html).not.toMatch(/data-action=|data-tier=/);
    }
  });
});
