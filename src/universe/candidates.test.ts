import { describe, expect, it } from "vitest";
import { REVENUE_CONCEPTS } from "../collectors/sources/frames";
import { loadCandidates } from "./candidates";
import { failedCriterion, selectUniverse, UNIVERSE_CRITERIA } from "./select";

const asOf = "2026-10-21";
const listings = [
  { ticker: "SAP.XETRA", name: "SAP SE", sector: "Technology", vendor_symbol: "SAP.XETRA", exchange: "XETRA", currency: "EUR", type: "Common Stock", current_exchange: "XETRA" },
  { ticker: "ABC.US", name: "ABC US Inc", sector: "Industrial", vendor_symbol: "ABC.US", exchange: "US", currency: "USD", type: "Common Stock", current_exchange: "US" },
  { ticker: "ABC.LSE", name: "ABC UK PLC", sector: "Industrial", vendor_symbol: "ABC.LSE", exchange: "LSE", currency: "GBP", type: "Common Stock", current_exchange: "LSE" },
  { ticker: "VOD.LSE", name: "Vodafone Group PLC", sector: "Telecom", vendor_symbol: "VOD.LSE", exchange: "LSE", currency: "GBX", type: "Common Stock", current_exchange: "LSE" },
  { ticker: "AI", name: "C3.ai Inc", sector: "Technology", vendor_symbol: "AI.US", exchange: "US", currency: "USD", type: "Common Stock", current_exchange: "US" },
  { ticker: "AI.PA", name: "Air Liquide SA", sector: "Materials", vendor_symbol: "AI.PA", exchange: "PA", currency: "EUR", type: "Common Stock", current_exchange: "PA" },
  { ticker: "LEG", name: "Legacy US Corp", sector: "Industrial", vendor_symbol: null, exchange: null, currency: null, type: null, current_exchange: null },
  // Symbol first synced after asOf: symbols has no history, so the listing must not become a US dollar line.
  { ticker: "BMW.XETRA", name: "BMW AG", sector: "Consumer", vendor_symbol: null, exchange: null, currency: null, type: null, current_exchange: "XETRA" },
  // Discovery-only name read from discovery_price_bars.
  { ticker: "DISC", name: "Discovery Co", sector: "Tech", vendor_symbol: null, exchange: null, currency: null, type: null, current_exchange: null },
];
const legacy = new Set(["LEG", "BMW.XETRA"]);
// Fifty distinct trading dates ending on asOf.
const dates = Array.from({ length: 50 }, (_, index) => new Date(Date.parse(`${asOf}T00:00:00Z`) - (49 - index) * 86_400_000).toISOString().slice(0, 10));
const quarters = ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"];

type Call = { statement: string; params: unknown[] };
function fakeDb(calls: Call[]) {
  return { query: async (statement: string, params: unknown[] = []) => {
    calls.push({ statement, params });
    if (statement.includes("FROM universe_membership")) return { rows: [] };
    if (statement.includes("FROM instruments i")) return { rows: listings };
    type BarRow = { ticker: string; bar_date: string; close: string; volume: string; origin: string; source_id: string; vendor_symbol: string | null; currency: string | null };
    if (statement.includes("FROM daily_bars")) return { rows: listings.filter((item) => item.ticker !== "DISC").flatMap((item): BarRow[] => dates.map((date) => ({
      ticker: item.ticker, bar_date: date, close: "100", volume: "200000", origin: "daily",
      source_id: legacy.has(item.ticker) ? "twelvedata" : "eodhd", vendor_symbol: item.vendor_symbol ?? item.ticker, currency: item.currency,
    }))).concat([
      { ticker: "ABC.LSE", bar_date: asOf, close: "1", volume: "1", source_id: "eodhd", vendor_symbol: "ABC.US", currency: "USD", origin: "daily" },
      { ticker: "AI.PA", bar_date: asOf, close: "1", volume: "1", source_id: "twelvedata", vendor_symbol: "AI", currency: null, origin: "daily" },
      ...dates.map((date) => ({ ticker: "DISC", bar_date: date, close: "30", volume: "1000000", source_id: "discovery", vendor_symbol: null, currency: null, origin: "discovery" })),
    ]).sort((a, b) => a.ticker.localeCompare(b.ticker) || a.bar_date.localeCompare(b.bar_date) || a.origin.localeCompare(b.origin)) };
    if (statement.includes("FROM instrument_ids")) return { rows: [] };
    if (statement.includes("FROM filing_watch")) return { rows: ["ABC.US", "AI", "LEG", "DISC"].map((symbol) => ({ symbol, form: "10-Q" })) };
    if (statement.includes("DISTINCT ON (ticker,source_id,concept,period,period_end)")) return { rows: listings.flatMap((item) => quarters.map((end, index) => ({
      ticker: item.ticker, concept: "Revenues", period: "quarter", period_end: end, value: String(index === 1 ? 100 : index === 5 ? 130 : 110),
      form: "EODHD", taxonomy: "eodhd", unit: item.currency === "GBX" ? "GBP" : item.currency ?? "USD", source_id: "eodhd",
    }))) };
    if (statement.includes("DISTINCT ON (ticker,source_id)")) return { rows: listings.map((item) => ({ ticker: item.ticker, value: "100000000", source_id: "eodhd" })) };
    if (statement.includes("DISTINCT ON (series_id)")) return { rows: [{ series_id: "ECB_EURUSD", obs_date: "2026-10-20", value: "1.16" }, { series_id: "ECB_EURGBP", obs_date: "2026-10-20", value: "0.87" }] };
    throw new Error(`Unexpected SQL: ${statement}`);
  } } as never;
}

describe("stored market candidate read model", () => {
  it("uses exact exchange bars, dated fundamentals and ECB rates", async () => {
    const rows = await loadCandidates(fakeDb([]), asOf);
    const result = selectUniverse(rows, { target: 20, sectorCapPct: 100 });
    expect(result.selected.map((row) => row.ticker).sort()).toEqual(["ABC.US", "AI", "AI.PA", "DISC", "LEG", "SAP.XETRA"]);
    // AI (US) and AI.PA share a code but are separate listings with their own currency, bars and filer rule.
    const ai = rows.find((row) => row.ticker === "AI"), airLiquide = rows.find((row) => row.ticker === "AI.PA");
    expect([ai?.exchange, ai?.currency, ai?.forms]).toEqual(["US", "USD", ["10-Q"]]);
    expect([airLiquide?.exchange, airLiquide?.currency, airLiquide?.forms, airLiquide?.lastClose, airLiquide?.barDays]).toEqual(["PA", "EUR", [], 100, 50]);
    expect(airLiquide?.marketCapUsd).toBe(11_600_000_000);
    expect(rows.find((row) => row.ticker === "LEG")).toMatchObject({ exchange: "US", currency: "USD", barDays: 50 });
    expect(rows.find((row) => row.ticker === "SAP.XETRA")?.marketCapUsd).toBe(11_600_000_000);
    expect(rows.find((row) => row.ticker === "VOD.LSE")).toMatchObject({ currency: "GBX", revenueQuarters: 6 });
    expect(rows.find((row) => row.ticker === "VOD.LSE")?.usdPerUnit).toBeCloseTo(1.16 / 0.87 / 100);
    expect(rows.find((row) => row.ticker === "DISC")).toMatchObject({ exchange: "US", currency: "USD", barDays: 50, lastClose: 30 });
  });
  it("fails closed on an ambiguous LSE pound quote and on a listing not yet synced", async () => {
    const rows = await loadCandidates(fakeDb([]), asOf);
    const abc = rows.find((row) => row.ticker === "ABC.LSE")!;
    expect(abc).toMatchObject({ currency: "GBP", listingIssue: "currency_unverified_gbx", barDays: 50 });
    expect(failedCriterion(abc, UNIVERSE_CRITERIA)).toBe("currency_unverified_gbx");
    const bmw = rows.find((row) => row.ticker === "BMW.XETRA")!;
    expect(bmw).toMatchObject({ exchange: "XETRA", currency: "", usdPerUnit: null, listingIssue: "listing_not_synced", barDays: 0 });
    expect(failedCriterion(bmw, UNIVERSE_CRITERIA)).toBe("listing_not_synced");
  });
  it("binds the score date to every query and the SEC revenue concepts to the revenue query", async () => {
    for (const date of [asOf, "2025-01-02"]) {
      const calls: Call[] = [];
      await loadCandidates(fakeDb(calls), date);
      expect(calls).toHaveLength(8);
      for (const call of calls) expect(call.params[0]).toBe(date);
      const revenue = calls.find((call) => call.statement.includes("concept=ANY($2)"))!;
      expect(revenue.params).toEqual([date, [...REVENUE_CONCEPTS]]);
      expect(calls.filter((call) => call.statement.includes("concept=ANY($2)"))).toHaveLength(1);
      expect(calls.filter((call) => call !== revenue).every((call) => call.params.length === 1)).toBe(true);
    }
  });
});
