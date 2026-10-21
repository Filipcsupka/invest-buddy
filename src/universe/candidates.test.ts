import { describe, expect, it } from "vitest";
import { loadCandidates } from "./candidates";
import { selectUniverse } from "./select";

const asOf = "2026-10-21";
const listings = [
  { ticker: "SAP.XETRA", name: "SAP SE", sector: "Technology", vendor_symbol: "SAP.XETRA", exchange: "XETRA", currency: "EUR", type: "Common Stock" },
  { ticker: "ABC.US", name: "ABC US Inc", sector: "Industrial", vendor_symbol: "ABC.US", exchange: "US", currency: "USD", type: "Common Stock" },
  { ticker: "ABC.LSE", name: "ABC UK PLC", sector: "Industrial", vendor_symbol: "ABC.LSE", exchange: "LSE", currency: "GBP", type: "Common Stock" },
  { ticker: "VOD.LSE", name: "Vodafone Group PLC", sector: "Telecom", vendor_symbol: "VOD.LSE", exchange: "LSE", currency: "GBX", type: "Common Stock" },
  { ticker: "AI", name: "C3.ai Inc", sector: "Technology", vendor_symbol: "AI.US", exchange: "US", currency: "USD", type: "Common Stock" },
  { ticker: "AI.PA", name: "Air Liquide SA", sector: "Materials", vendor_symbol: "AI.PA", exchange: "PA", currency: "EUR", type: "Common Stock" },
  { ticker: "LEG", name: "Legacy US Corp", sector: "Industrial", vendor_symbol: null, exchange: null, currency: null, type: null },
];
const source = (item: typeof listings[number]) => item.exchange === null ? "twelvedata" : "eodhd";
const quarters = ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"];

describe("stored market candidate read model", () => {
  it("uses exact exchange bars, dated fundamentals and ECB rates", async () => {
    const sql: string[] = [];
    const db = { query: async (statement: string) => {
      sql.push(statement);
      if (statement.includes("FROM universe_membership")) return { rows: [] };
      if (statement.includes("FROM instruments i")) return { rows: listings };
      if (statement.includes("FROM daily_bars")) return { rows: listings.flatMap((item) => Array.from({ length: 50 }, (_, index) => ({
        ticker: item.ticker, bar_date: `2026-09-${String(index % 30 + 1).padStart(2, "0")}`, close: "100", volume: "200000",
        source_id: source(item), vendor_symbol: item.vendor_symbol ?? item.ticker, currency: item.currency,
      }))).concat([
        { ticker: "ABC.LSE", bar_date: asOf, close: "1", volume: "1", source_id: "eodhd", vendor_symbol: "ABC.US", currency: "USD" },
        { ticker: "AI.PA", bar_date: asOf, close: "1", volume: "1", source_id: "twelvedata", vendor_symbol: "AI", currency: null },
      ]) };
      if (statement.includes("FROM instrument_ids")) return { rows: [] };
      if (statement.includes("FROM filing_watch")) return { rows: ["ABC.US", "AI", "LEG"].map((symbol) => ({ symbol, form: "10-Q" })) };
      if (statement.includes("DISTINCT ON (ticker,source_id,concept,period_end)")) return { rows: listings.flatMap((item) => quarters.map((end, index) => ({
        ticker: item.ticker, concept: "Revenues", period_end: end, value: String(index === 1 ? 100 : index === 5 ? 130 : 110),
        form: "EODHD", taxonomy: "eodhd", unit: item.currency === "GBX" ? "GBP" : item.currency, source_id: "eodhd",
      }))) };
      if (statement.includes("DISTINCT ON (ticker,source_id)")) return { rows: listings.map((item) => ({ ticker: item.ticker, value: "100000000", source_id: "eodhd" })) };
      if (statement.includes("DISTINCT ON (series_id)")) return { rows: [{ series_id: "ECB_EURUSD", value: "1.16" }, { series_id: "ECB_EURGBP", value: "0.87" }] };
      throw new Error(`Unexpected SQL: ${statement}`);
    } } as never;
    const rows = await loadCandidates(db, asOf);
    const result = selectUniverse(rows, { target: 10, sectorCapPct: 100 });
    expect(result.selected.map((row) => row.ticker).sort()).toEqual(["ABC.LSE", "ABC.US", "AI", "AI.PA", "LEG", "SAP.XETRA"]);
    // AI (US) and AI.PA share a code but are separate listings with their own currency, bars and filer rule.
    const ai = rows.find((row) => row.ticker === "AI"), airLiquide = rows.find((row) => row.ticker === "AI.PA");
    expect([ai?.exchange, ai?.currency, ai?.forms]).toEqual(["US", "USD", ["10-Q"]]);
    expect([airLiquide?.exchange, airLiquide?.currency, airLiquide?.forms, airLiquide?.lastClose]).toEqual(["PA", "EUR", [], 100]);
    expect(airLiquide?.marketCapUsd).toBe(11_600_000_000);
    expect(rows.find((row) => row.ticker === "LEG")).toMatchObject({ exchange: "US", currency: "USD", barDays: 50 });
    expect(rows.find((row) => row.ticker === "ABC.LSE")?.avgDollarVolume50).toBe(20_000_000);
    expect(rows.find((row) => row.ticker === "SAP.XETRA")?.marketCapUsd).toBe(11_600_000_000);
    expect(rows.find((row) => row.ticker === "VOD.LSE")?.revenueQuarters).toBe(6);
    expect(rows.find((row) => row.ticker === "VOD.LSE")?.usdPerUnit).toBeCloseTo(1.16 / 0.87 / 100);
    expect(sql.filter((statement) => statement.includes("FROM fundamentals_pit")).every((statement) => statement.includes("(first_seen_at AT TIME ZONE 'UTC')::date<=$1::date"))).toBe(true);
    expect(sql.find((statement) => statement.includes("FROM macro_observations"))).toContain("(observed_at AT TIME ZONE 'UTC')::date<=$1::date");
  });
});
