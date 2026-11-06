import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const universe = vi.fn();
const scores = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("@/data/flag-facts", () => ({ storedShareCounts: async () => [], storedInterestFacts: async () => ({ operatingIncome: null, interestExpense: null }) }));
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe(), latestScores: () => scores(), latestPortfolio: async () => null }));
vi.mock("@/data/score-history", () => ({ companyScoreHistory: async () => [] }));
vi.mock("@/data/ideas-store", () => ({ companyIdea: async () => null, companyReview: async () => null }));
// One fake pool for every web read: the earnings calendar answers, every other table is empty.
const query = vi.fn();
vi.mock("@/db/pool", () => ({ getPool: () => ({ query }) }));

import Company from "./page";
import { scoredUniverse } from "@/data/scored";

const original = { flag: process.env.PUBLIC_EARNINGS_DATES, advice: process.env.ADVICE_OUTPUT, mode: process.env.DATA_MODE };
afterEach(() => {
  for (const [key, value] of [["PUBLIC_EARNINGS_DATES", original.flag], ["ADVICE_OUTPUT", original.advice], ["DATA_MODE", original.mode]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  universe.mockReset(); scores.mockReset(); query.mockReset();
});

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function render(locale: string, flag: string | undefined) {
  if (flag === undefined) delete process.env.PUBLIC_EARNINGS_DATES; else process.env.PUBLIC_EARNINGS_DATES = flag;
  process.env.ADVICE_OUTPUT = "off";
  delete process.env.DATA_MODE;
  const [row] = await scoredUniverse();
  universe.mockResolvedValue([row.instrument]);
  scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: row.result.asOf, stale: false });
  const today = iso(0);
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('AS "latestPull"')) return { rows: [{ latestPull: today }] };
    if (sql.includes("earnings_calendar_snapshots")) return { rows: [{ ticker: row.instrument.ticker, observedOn: today, reportDate: iso(5), fiscalDateEnding: "2026-09-30", timeOfDay: "post-market" }] };
    return { rows: [] };
  });
  const html = renderToStaticMarkup(await Company({ params: Promise.resolve({ locale, ticker: row.instrument.ticker }) }));
  return { html, earningsReads: query.mock.calls.filter(([sql]) => String(sql).includes("earnings_calendar_snapshots")).length };
}

describe("company page calendar", () => {
  it.each([undefined, "off"])("keeps the Alpha Vantage earnings date off the public page when PUBLIC_EARNINGS_DATES is %s", async (flag) => {
    const { html, earningsReads } = await render("en", flag);
    expect(html).not.toContain('data-kind="earnings"');
    expect(html).not.toContain("Earnings report");
    expect(html).not.toContain("Alpha Vantage earnings calendar");
    expect(earningsReads).toBe(0);
  });

  it.each([["en", "Earnings report", "after the market closes"], ["sk", "Zverejnenie výsledkov", "po zatvorení trhu"]])("shows the next earnings date in %s with the flag on", async (locale, label, time) => {
    const { html, earningsReads } = await render(locale, "on");
    expect(html).toContain("data-catalyst-calendar");
    expect(html).toContain('data-kind="earnings"');
    expect(html).toContain(label);
    expect(html).toContain(`dateTime="${iso(5)}"`);
    expect(html).toContain(time);
    expect(earningsReads).toBeGreaterThan(0);
  });

  it.each(["en", "sk"])("keeps the calendar slot free of action wording in %s", async (locale) => {
    const { html } = await render(locale, "on");
    const slot = html.slice(html.indexOf("data-catalyst-calendar"), html.indexOf("</section>", html.indexOf("data-catalyst-calendar")));
    expect(slot.replace(/<[^>]+>/g, " ")).not.toMatch(/\b(?:buy|sell|add|start|reduce|wait|position|EUR|signal)\b|prikúp|kúp|predaj|zníž|pozíci|signál/i);
  });
});
