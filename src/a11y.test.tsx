import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const universe = vi.fn();
const scores = vi.fn();
const portfolio = vi.fn();
const history = vi.fn();
const insiders = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard" }));
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe(), latestScores: () => scores(), latestPortfolio: () => portfolio(), scoreHistory: () => [], stale: () => false }));
vi.mock("@/data/score-history", () => ({ companyScoreHistory: () => history() }));
vi.mock("@/data/ideas-store", () => ({ companyIdea: async () => null, companyReview: async () => null, ideasEnabled: () => false }));
vi.mock("@/db/track-record", () => ({ recordHistory: async () => ({ snapshotCount: 1, firstDate: "2026-01-02", lastDate: "2026-01-02", buySignalCount: 1, worst: [{ id: 1, ticker: "NVDA", asOf: "2026-01-02", window: 1, stock: -0.1, excess: -0.15 }], hit20: { hits: 1, n: 1, rate: 1 }, signals: [{ id: 1, ticker: "NVDA", asOf: "2026-01-02", tier: "SETUP", state: "Setup met (>=18)", score: 20, windows: { 1: { date: "2026-01-05", stock: 0.1, spy: 0.05, excess: 0.05 }, 5: null, 20: null, 60: null } }] }) }));
vi.mock("@/db/record-benchmark", () => ({ recordBenchmark: async () => [] }));
vi.mock("@/db/insiders", () => ({ insiderEvents: () => insiders() }));

import Dashboard from "./app/[locale]/dashboard/page";
import Company from "./app/[locale]/company/[ticker]/page";
import Insiders from "./app/[locale]/insiders/page";
import Methodology from "./app/[locale]/methodology/page";
import TrackRecord from "./app/[locale]/track-record/page";
import { Footer, Nav } from "@/components/nav";
import { scoredUniverse } from "@/data/scored";

const original = { mode: process.env.DATA_MODE, insiders: process.env.INSIDERS_PAGE };
beforeEach(async () => {
  const rows = await scoredUniverse();
  universe.mockResolvedValue(rows.map((row) => row.instrument));
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: rows[0].result.asOf, stale: false });
  portfolio.mockResolvedValue(null);
  history.mockResolvedValue([]);
  insiders.mockResolvedValue([{ accession: "0001", lineNo: 1, ticker: "NVDA", ownerName: "A Person", reportingOwners: [], isDirector: true, isOfficer: false, isTenPercentOwner: false, isOther: false, transactionDate: "2026-09-01", filedAt: "2026-09-03", code: "P", shares: 100, value: 1000, secUrl: "https://www.sec.gov/x" }]);
  process.env.INSIDERS_PAGE = "on";
  process.env.DATA_MODE = "db";
});
afterEach(() => {
  if (original.mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = original.mode;
  if (original.insiders === undefined) delete process.env.INSIDERS_PAGE; else process.env.INSIDERS_PAGE = original.insiders;
});

const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

async function pages(locale: string) {
  const props = { params: Promise.resolve({ locale }) };
  const [first] = await scoredUniverse();
  return {
    dashboard: renderToStaticMarkup(await Dashboard(props)),
    company: renderToStaticMarkup(await Company({ params: Promise.resolve({ locale, ticker: first.instrument.ticker }) })),
    methodology: renderToStaticMarkup(await Methodology(props)),
    trackRecord: renderToStaticMarkup(await TrackRecord(props)),
    insiders: renderToStaticMarkup(await Insiders({ ...props, searchParams: Promise.resolve({}) })),
  };
}

describe.each(["en", "sk"])("public pages (%s)", (locale) => {
  it("has one h1 first, and no skipped heading level", async () => {
    for (const [name, html] of Object.entries(await pages(locale))) {
      const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
      expect(levels.filter((l) => l === 1), `${name} h1 count`).toHaveLength(1);
      expect(levels[0], `${name} first heading`).toBe(1);
      levels.forEach((level, i) => { if (i > 0) expect(level - levels[i - 1], `${name} heading jump at ${i}`).toBeLessThanOrEqual(1); });
    }
  });

  it("keeps ids unique and every aria reference resolvable", async () => {
    for (const [name, html] of Object.entries(await pages(locale))) {
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), `${name} duplicate ids`).toEqual([]);
      for (const m of html.matchAll(/\saria-(?:describedby|labelledby)="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) expect(ids, `${name} aria reference ${id}`).toContain(id);
    }
  });

  it("gives every scrollable table region a role, a label and a tab stop", async () => {
    let seen = 0;
    for (const [name, html] of Object.entries(await pages(locale))) {
      for (const m of html.matchAll(/<div[^>]*class="table-scroll"[^>]*>/g)) {
        seen += 1;
        expect(attr(m[0], "role"), `${name} role`).toBe("region");
        expect(attr(m[0], "tabindex"), `${name} tabindex`).toBe("0");
        expect(attr(m[0], "aria-label")?.trim(), `${name} label`).toBeTruthy();
      }
    }
    expect(seen).toBeGreaterThan(3);
  });

  it("uses header cells in every data table and names every button, link and image", async () => {
    for (const [name, html] of Object.entries(await pages(locale))) {
      for (const m of html.matchAll(/<table([^>]*)>([\s\S]*?)<\/table>/g)) if (!/tally/.test(m[1])) expect(m[2], `${name} table without th`).toMatch(/<th[\s>]/);
      for (const m of html.matchAll(/<(button|a)(\s[^>]*)?>([\s\S]*?)<\/\1>/g)) expect(Boolean(attr(m[2] ?? "", "aria-label")?.trim()) || text(m[3]).length > 0, `${name} unnamed ${m[1]}: ${m[0].slice(0, 120)}`).toBe(true);
      for (const m of html.matchAll(/<img[^>]*>/g)) expect(m[0], `${name} img alt`).toMatch(/\salt="/);
      expect(html, `${name} positive tabindex`).not.toMatch(/tabindex="[1-9]/);
    }
  });

  it("has labelled landmarks in the shell", async () => {
    const nav = renderToStaticMarkup(<Nav locale={locale as "en" | "sk"} />);
    const footer = renderToStaticMarkup(await Footer({ locale: locale as "en" | "sk" }));
    expect(nav).toMatch(/<header[^>]*class="site-header"/);
    expect(nav).toMatch(/<nav aria-label="[^"]+"[^>]*class="nav-links"/);
    expect(nav).toMatch(/<a[^>]*class="brand"[^>]*aria-label="[^"]+"|<a[^>]*aria-label="[^"]+"[^>]*class="brand"/);
    expect(nav).toMatch(/class="lang-switch"[^>]*/);
    expect(nav).toMatch(/<button[^>]*aria-label="[^"]+"/);
    expect(footer).toMatch(/<footer/);
    expect(footer).toMatch(/<nav aria-label="[^"]+"/);
  });
});

it("layout puts the skip link before the nav and targets the focusable main", () => {
  const layout = readFileSync("src/app/[locale]/layout.tsx", "utf8");
  expect(layout.indexOf('href="#main"')).toBeGreaterThan(0);
  expect(layout.indexOf('href="#main"')).toBeLessThan(layout.indexOf("<Nav "));
  expect(layout).toMatch(/<main id="main" tabIndex=\{-1\}>/);
  expect(layout).toMatch(/<html lang=\{locale\}/);
});
