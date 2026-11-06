import { describe, expect, it, vi } from "vitest";
import type pg from "pg";
import type { NewsItem } from "../data-providers/eodhd/client";
import { loadCatalystCalendar, loadCatalystSubjects, parseArgs, runEodhdCatalyst, type CatalystSubject } from "./eodhd-catalyst";
import { loadCatalyst } from "../data/catalyst";

const now = new Date("2026-10-21T12:00:00Z");
const rows: CatalystSubject[] = [
  { ticker: "ASML", vendorSymbol: "ASML.AS", score: 17 },
  { ticker: "SAP", vendorSymbol: "SAP.XETRA", score: 15 },
  { ticker: "LOW", vendorSymbol: "LOW.PA", score: 14 },
];
const news: NewsItem[] = [
  { date: "2026-10-19T09:00:00Z", title: "New product", link: "https://example.com/one", symbols: ["ASML.AS"], tags: ["PRODUCT"], sentiment: { polarity: 0.8 } },
  { date: "2026-10-20T09:00:00Z", title: "New partnership", link: "https://example.com/two", symbols: ["ASML.AS"], tags: ["PARTNERSHIP"], sentiment: { polarity: 0.7 } },
];

describe("EODHD catalyst job", () => {
  it("requests one symbol at a time and keeps low-score names off the paid endpoint", async () => {
    const api = { news: vi.fn().mockResolvedValue(news), getCallCosts: () => ({ news: 5 }) };
    const result = await runEodhdCatalyst(null, api, { dryRun: true, now, subjects: rows, calendarRows: [] });
    expect(api.news).toHaveBeenCalledTimes(2);
    expect(api.news.mock.calls.map((call) => call[0].symbol)).toEqual(["ASML.AS", "SAP.XETRA"]);
    expect(api.news.mock.calls[0][0]).toMatchObject({ from: "2026-10-14", to: "2026-10-21", limit: 25 });
    expect(result).toMatchObject({ shortlisted: 2, newsRequests: 2, newsArticles: 2, facts: 1, documents: 0, possibleTickerSurcharge: 10 });
  });

  it("lets a busy name fill only its own request and ignores articles for other symbols", async () => {
    const busy: NewsItem[] = Array.from({ length: 30 }, (_, i) => ({ ...news[0], title: `ASML story ${i}`, link: `https://example.com/a${i}` }));
    const sap: NewsItem = { ...news[0], title: "SAP launch", link: "https://example.com/sap", symbols: ["SAP.XETRA"] };
    const api = { news: vi.fn(async ({ symbol }: { symbol: string; limit: number }) => symbol === "ASML.AS" ? busy : [sap, { ...sap, title: "SAP platform", link: "https://example.com/sap2" }]), getCallCosts: () => ({ news: 5 }) };
    const result = await runEodhdCatalyst(null, api, { dryRun: true, now, subjects: rows, calendarRows: [] });
    expect(result.facts).toBe(2);
    expect(api.news.mock.calls.every((call) => call[0].limit === 25)).toBe(true);
  });

  it("drops the same story under another URL, case or punctuation", async () => {
    const copies: NewsItem[] = [news[0], { ...news[0], link: "https://other.example.com/copy", title: "NEW  product!" }];
    const api = { news: async () => copies, getCallCosts: () => ({ news: 5 }) };
    const result = await runEodhdCatalyst(null, api, { dryRun: true, now, subjects: rows.slice(0, 1), calendarRows: [] });
    expect(result).toMatchObject({ newsArticles: 1, facts: 0 });
  });

  it("stores provenance in internal documents and writes the score fact under the shared key", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    let id = 0;
    const db = { query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO source_documents")) return { rows: [{ id: ++id }], rowCount: 1 };
      if (sql.includes("INSERT INTO collected_facts")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    } } as unknown as pg.Pool;
    const api = { news: async () => news, getCallCosts: () => ({ news: 5 }) };
    const result = await runEodhdCatalyst(db, api, { now, subjects: rows.slice(0, 1), calendarRows: [] });
    expect(result).toMatchObject({ documents: 2, facts: 1, failures: 0 });
    const stored = calls.filter((call) => call.sql.includes("INSERT INTO source_documents"));
    expect(stored).toHaveLength(2);
    expect(stored[0].params.slice(0, 3)).toEqual(["eodhd", "ASML", "news"]);
    expect(JSON.parse(String(stored[0].params[7]))).toMatchObject({ headline: "New product", tags: ["PRODUCT"], display_allowed: false, vendorSymbol: "ASML.AS" });
    const fact = calls.find((call) => call.sql.includes("INSERT INTO collected_facts"))!;
    expect(fact.params.slice(0, 3)).toEqual(["ASML", "catalyst_8k_eodhd", "2026-10-21"]);
    expect(JSON.parse(String(fact.params[3]))).toMatchObject({ source: "eodhd", kind: "news_cluster", documentIds: [1, 2] });
  });

  it("limits calendar reads to first observations available by the score date", async () => {
    let query = "";
    const db = { query: async (sql: string) => { query = sql; return { rows: [] }; } } as unknown as pg.Pool;
    await loadCatalystCalendar(db, ["ASML"], "2026-10-21");
    expect(query).toContain("observed_on <= $2::date");
    expect(query).toContain("(observed_at AT TIME ZONE 'UTC')::date <= $2::date");
    expect(parseArgs(["--dry-run", "--as-of", "2026-10-21", "--only", "ASML.AS"])).toMatchObject({ dryRun: true, only: ["ASML.AS"] });
    expect(() => parseArgs(["--max-news-symbols", "21"])).toThrow();
  });

  it("resolves the vendor symbol through the home-listing resolver, so US C3.ai never becomes AI.PA", async () => {
    const symbols = [
      { vendor_symbol: "AI.US", code: "AI", exchange: "US", currency: "USD" },
      { vendor_symbol: "AI.PA", code: "AI", exchange: "PA", currency: "EUR" },
      { vendor_symbol: "ASML.AS", code: "ASML", exchange: "AS", currency: "EUR" },
      { vendor_symbol: "SAP.XETRA", code: "SAP", exchange: "XETRA", currency: "EUR" },
      { vendor_symbol: "SAP.US", code: "SAP", exchange: "US", currency: "USD" },
    ];
    const db = { query: async (sql: string) => {
      if (sql.includes("FROM universe_membership")) return { rows: ["AI", "ASML", "SAP", "GHOST"].map((ticker) => ({ ticker, name: ticker, sector: "x", tier: 1 })) };
      if (sql.includes("SELECT ticker, vendor_symbols FROM instrument_ids")) return { rows: [{ ticker: "SAP", vendor_symbols: { eodhd: "SAP.XETRA" } }] };
      if (sql.includes("SELECT ticker,exchange FROM instrument_ids")) return { rows: [{ ticker: "AI", exchange: "NYSE" }, { ticker: "ASML", exchange: "AS" }, { ticker: "SAP", exchange: "XETR" }] };
      if (sql.includes("FROM symbols")) return { rows: symbols };
      if (sql.includes("FROM score_results")) return { rows: [{ ticker: "ASML", total: 17 }, { ticker: "SAP", total: "15" }] };
      if (sql.includes("earnings_calendar_snapshots")) return { rows: [] };
      throw new Error(`unexpected sql ${sql}`);
    } } as unknown as pg.Pool;
    const { subjects, unresolved } = await loadCatalystSubjects(db, "2026-10-21");
    expect(subjects).toEqual([{ ticker: "ASML", vendorSymbol: "ASML.AS", score: 17 }, { ticker: "SAP", vendorSymbol: "SAP.XETRA", score: 15 }]);
    expect(unresolved).toEqual(["GHOST"]);
    const api = { news: vi.fn().mockResolvedValue([]), getCallCosts: () => ({ news: 5 }) };
    const result = await runEodhdCatalyst(db, api, { dryRun: true, now });
    expect(api.news.mock.calls.map((call) => call[0].symbol)).not.toContain("AI.PA");
    expect(result).toMatchObject({ failures: 1, failedSymbols: "GHOST" });
  });

  it("does not match a ticker by code alone on a non-US exchange", async () => {
    const db = { query: async (sql: string) => {
      if (sql.includes("FROM universe_membership")) return { rows: [{ ticker: "AI", name: "C3.ai", sector: "x", tier: 1 }] };
      if (sql.includes("SELECT ticker, vendor_symbols FROM instrument_ids")) return { rows: [] };
      if (sql.includes("SELECT ticker,exchange FROM instrument_ids")) return { rows: [{ ticker: "AI", exchange: "NYSE" }] };
      if (sql.includes("FROM symbols")) return { rows: [{ vendor_symbol: "AI.PA", code: "AI", exchange: "PA", currency: "EUR" }] };
      return { rows: [] };
    } } as unknown as pg.Pool;
    expect(await loadCatalystSubjects(db, "2026-10-21")).toEqual({ subjects: [], unresolved: ["AI"] });
  });

  it("reads the best of the SEC and EODHD facts, so neither source hides the other", async () => {
    const stored = [
      { as_of: "2026-10-21", value: { present: true, source: "eodhd", kind: "news_cluster", observedOn: "2026-10-21", evidenceCount: 2, documentIds: [] } },
      { as_of: "2026-10-21", value: { present: false, checked: 3 } },
    ];
    let params: unknown[] = [];
    const pool = { query: async (_sql: string, values: unknown[]) => { params = values; return { rows: stored }; } };
    expect(await loadCatalyst(pool, "ASML", "2026-10-21")).toMatchObject({ value: true });
    expect(params[1]).toEqual(["catalyst_8k", "catalyst_8k_eodhd"]);
  });
});
