import { describe, expect, it } from "vitest";
import { formsFromSubmissions, mergePool, withForms, type PoolRowWithForms } from "./forms";
import type { PoolRow } from "./pool";

const row = (ticker: string, cik: number): PoolRow => ({ ticker, cik, name: `${ticker} Inc`, concept: "Revenues", end: "2026-06-30", revenue: 1e8, yoyPercent: 40, qoqPercent: 5, priorYoyPercent: 30, accelerationPp: 10, rank: 1 });
const cand = (ticker: string, over: Record<string, unknown> = {}) => ({ ticker, name: `${ticker} Inc`, sector: "Unclassified", cik: null, forms: [] as string[], core: false, revenueQuarters: 0, yoyGrowthPct: null as number | null, lastClose: 50 as number | null, avgDollarVolume50: 5e7 as number | null, barDays: 200, ...over });

describe("formsFromSubmissions", () => {
  it("returns distinct sorted forms and tolerates a missing list", () => {
    expect(formsFromSubmissions(JSON.stringify({ filings: { recent: { form: ["10-Q", "8-K", "10-Q", "10-K"] } } }))).toEqual(["10-K", "10-Q", "8-K"]);
    expect(formsFromSubmissions("{}")).toEqual([]);
  });
});

describe("withForms", () => {
  it("fetches by padded CIK and keeps null when a fetch fails", async () => {
    const urls: string[] = [];
    const http = { get: async (url: string) => { urls.push(url); if (url.includes("0000000002")) throw new Error("HTTP 500"); return JSON.stringify({ filings: { recent: { form: ["20-F"] } } }); } };
    const out = await withForms([row("AAA", 1), row("BBB", 2)], http);
    expect(urls[0]).toBe("https://data.sec.gov/submissions/CIK0000000001.json");
    expect(out.map((r) => r.forms)).toEqual([["20-F"], null]);
  });
});

describe("mergePool", () => {
  const p = (ticker: string, forms: string[] | null): PoolRowWithForms => ({ ...row(ticker, 7), forms });
  it("fills forms, quarters and growth where the database has none", () => {
    const [c] = mergePool([cand("AAA")], [p("AAA", ["10-K", "10-Q"])]);
    expect(c).toMatchObject({ forms: ["10-K", "10-Q"], revenueQuarters: 4, yoyGrowthPct: 40, cik: 7 });
  });
  it("never overrides a core name or existing database values", () => {
    const [core] = mergePool([cand("CORE", { core: true })], [p("CORE", ["20-F"])]);
    expect(core.forms).toEqual([]);
    const [kept] = mergePool([cand("KEEP", { forms: ["10-K"], revenueQuarters: 12, yoyGrowthPct: 9 })], [p("KEEP", ["20-F"])]);
    expect(kept).toMatchObject({ forms: ["10-K"], revenueQuarters: 12, yoyGrowthPct: 9 });
  });
  it("adds pool names the database does not know, without bars, and keeps unknown forms empty", () => {
    const out = mergePool([], [p("NEW", null)]);
    expect(out[0]).toMatchObject({ ticker: "NEW", forms: [], lastClose: null, barDays: 0 });
  });
});
