import { expect, it } from "vitest";
import { aumEur, etfBarFacts, readEtfScoreFacts } from "./etf-score";

it("infers EUR AUM only from matching fund and listing currencies", () => {
  expect(aumEur(100_000_000, null, "EUR", "EUR", 1)).toEqual({ value: 100_000_000, reason: "inferred_matching_currencies" });
  expect(aumEur(100_000_000, null, "USD", "EUR", 0.9).reason).toBe("ambiguous_aum_currency");
  expect(aumEur(100_000_000, null, "USD", "USD", 0.9).value).toBe(90_000_000);
});
it("computes trend and median value traded from dated bars", () => {
  const bars = Array.from({ length: 252 }, (_, i) => ({ date: `2025-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + i % 28).padStart(2, "0")}`, close: i < 220 ? 100 : 110, volume: 10_000, currency: "EUR" }));
  const result = etfBarFacts(bars, 1);
  expect(result).toMatchObject({ barsCount: 252, medianValueTradedEur: 1_100_000, close: 110 });
  expect(result.sma200).toBeGreaterThan(100);
  expect(result.return12to1m).toBeCloseTo(0.1);
});
it("reads only point-in-time inputs", async () => {
  const seen: string[] = [];
  const db = { query: async (sql: string) => { seen.push(sql); if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", instrument_type: "ETF", name: "Plain", last_seen: "2026-11-12", trading_currency: "EUR", asset_class: "bond", ter_pct: "0.2", vendor_symbol: "X.DE" }] }; return { rows: [] }; } };
  const facts = await readEtfScoreFacts("X", "2026-11-12", db as never);
  expect(facts?.terPct).toBe(0.2);
  expect(facts?.aumCurrencyReason).toBe("missing_aum");
  expect(seen.filter((sql) => sql.includes("etf_fund_stats") || sql.includes("etf_holdings") || sql.includes("etf_exposure") || sql.includes("asset_bars")).every((sql) => sql.includes("<=$"))).toBe(true);
});
