import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { scoredUniverse } from "@/data/scored";
import { sampleIdeas } from "@/ideas/fixtures";

const scores = vi.fn();
const portfolio = vi.fn();
const universe = vi.fn();
const idea = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores(), latestPortfolio: () => portfolio(), instrumentUniverse: () => universe() }));
vi.mock("@/data/ideas-store", () => ({ companyIdea: () => idea(), companyReview: async () => null, ideasEnabled: () => true }));

import Home from "./[locale]/page";
import Dashboard from "./[locale]/dashboard/page";
import Company from "./[locale]/company/[ticker]/page";
import { proxy } from "@/proxy";

const original = { advice: process.env.ADVICE_OUTPUT, mode: process.env.DATA_MODE };
afterEach(() => {
  for (const [key, value] of [["ADVICE_OUTPUT", original.advice], ["DATA_MODE", original.mode]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  scores.mockReset(); portfolio.mockReset(); universe.mockReset(); idea.mockReset();
});

it.each(["en", "sk"])("keeps actionable wording off public %s screens", async (locale) => {
  process.env.ADVICE_OUTPUT = "off";
  process.env.DATA_MODE = "fixture";
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
  portfolio.mockResolvedValue(null);
  universe.mockResolvedValue(rows.map((row) => row.instrument));
  idea.mockResolvedValue({ idea: sampleIdeas[0], sample: true });
  const props = { params: Promise.resolve({ locale }) };
  const companyProps = { params: Promise.resolve({ locale, ticker: rows[0].instrument.ticker }) };
  const html = [Home(props), Dashboard(props), Company(companyProps)];
  const rendered = (await Promise.all(html)).map((page) => renderToStaticMarkup(page)).join("\n");
  expect(rendered).not.toMatch(/Add about|Add 1\/3|Start position|High-conviction add|>Reduce<|Prikúpiť|Otvoriť pozíciu|Výrazne prikúpiť|>Znížiť<|data-action=|data-tier=/i);
  expect((await proxy(new NextRequest(`https://example.com/${locale}/sizing`))).status).toBe(404);
});
