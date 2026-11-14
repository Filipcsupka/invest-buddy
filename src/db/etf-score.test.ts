import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEtfData } from "./etf-detail";
import { aumEur, benchmarkSymbol, etfBarFacts, latestEtfScores, readEtfScoreFacts, usEquityWeight } from "./etf-score";
import { etfScore } from "@/engine/etf-score";

it("requires an explicit asset currency, independent of the listing quote", () => {
  expect(aumEur(100_000_000, null, 1)).toEqual({ value: null, reason: "ambiguous_aum_currency" });
  expect(aumEur(100_000_000, "EUR", 1).value).toBe(100_000_000);
  expect(aumEur(100_000_000, "USD", 0.9).value).toBe(90_000_000);
  expect(aumEur(100_000_000, "USD", null).reason).toBe("missing_fx");
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
it("uses US catalog AUM when fund-stat currency is unknown", async () => {
  const db = { query: async (sql: string) => {
    if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", name: "Plain fund", instrument_type: "ETF", listing_region: "US", trading_currency: "USD", aum_usd_m: 100, last_seen: "2026-11-12" }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: [{ listing_key: "X", total_assets: 200_000_000, total_assets_currency: null }] };
    if (sql.includes("EURUSD.FOREX")) return { rows: [{ close: 2 }] };
    return { rows: [] };
  } };
  expect((await readEtfScoreFacts("X", "2026-11-12", db as never))?.aumEur).toBe(50_000_000);
});
it.each([
  ["missing stats", null],
  ["unsupported asset currency", { total_assets: 200_000_000, total_assets_currency: "GBP" }],
  ["missing fund-stat AUM", { total_assets: null, total_assets_currency: "USD" }],
] as const)("uses US catalog AUM with %s", async (_case, fundStats) => {
  const db = { query: async (sql: string) => {
    if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", name: "Plain fund", instrument_type: "ETF", listing_region: "US", trading_currency: "USD", aum_usd_m: 100, last_seen: "2026-11-12" }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: fundStats ? [{ listing_key: "X", ...fundStats }] : [] };
    if (sql.includes("EURUSD.FOREX")) return { rows: [{ close: 2 }] };
    return { rows: [] };
  } };
  expect((await readEtfScoreFacts("X", "2026-11-12", db as never))?.aumEur).toBe(50_000_000);
});
it("does not infer fund currency from a European listing", async () => {
  const db = { query: async (sql: string) => {
    if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", name: "Plain fund", instrument_type: "ETF", listing_region: "EU", trading_currency: "USD", aum_usd_m: 100, last_seen: "2026-11-12" }] };
    if (sql.includes("EURUSD.FOREX")) return { rows: [{ close: 2 }] };
    return { rows: [] };
  } };
  expect((await readEtfScoreFacts("X", "2026-11-12", db as never))?.aumEur).toBeNull();
});
it("does not treat all-zero volume as a known trading value", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ date: String(i).padStart(4, "0"), close: 100, volume: 0, currency: "USD" }));
  expect(etfBarFacts(bars, 1).medianValueTradedEur).toBeNull();
});

it.each(["exsa", "vusa"])("does not invent asset currency from the %s EUR listing", (name) => {
  const raw = JSON.parse(readFileSync(`src/data-providers/eodhd/fixtures/real/etf-${name}.json`, "utf8"));
  const data = parseEtfData(raw.response);
  expect(data?.tradingCurrency).toBe("EUR");
  expect(aumEur(data!.totalAssets, null, 1)).toEqual({ value: null, reason: "ambiguous_aum_currency" });
});
it("uses regional bounds without equating North America with the US", () => {
  const regions = (weight_pct: number) => [{ kind: "region", label: "North America", weight_pct }];
  expect(usEquityWeight(regions(70), [])).toBeNull();
  expect(usEquityWeight(regions(40), [])).toBe(40);
  expect(usEquityWeight(regions(70), [{ country: "United States", weight_pct: 55 }])).toBe(55);
});
it.each([false, true])("reads dated TER and USD FX, stale bars=%s", async (stale) => {
  const seen: string[] = [];
  const db = { query: async (sql: string) => {
    seen.push(sql);
    if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", name: "Plain fund", instrument_type: "ETF", trading_currency: "USD", ter_pct: 9, vendor_symbol: "X.US" }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: [{ listing_key: "X", ongoing_charge_pct: "0.15", total_assets: 100, total_assets_currency: "USD" }] };
    if (sql.includes("EURUSD.FOREX")) return { rows: [{ close: 2 }] };
    if (sql.includes("b.high,b.low")) return { rows: Array.from({ length: 252 }, (_, i) => ({ vendor_symbol: "X.US", date: new Date(Date.parse(stale ? "2026-01-01" : "2026-11-12") - i * 86400000).toISOString().slice(0, 10), close: 100, volume: 10, currency: "USD" })) };
    return { rows: [] };
  } };
  const f = await readEtfScoreFacts("X", "2026-11-12", db as never);
  expect(f?.terPct).toBe(0.15);
  expect(f?.aumEur).toBe(50);
  expect(f?.medianValueTradedEur).toBe(stale ? null : 500);
  expect(f?.barsCount).toBe(stale ? 0 : 252);
  expect(seen.find((sql) => sql.includes("EURUSD.FOREX"))).toContain("- 7");
});
it.each([200, 251, 252])("requires 252 bars for year-long trend facts (%s bars)", (count) => {
  const facts = etfBarFacts(Array.from({ length: count }, (_, i) => ({ date: String(i).padStart(4, "0"), close: 100, volume: 1, currency: "EUR" })), 1);
  expect(facts.sma200).toBe(100);
  expect(facts.return12to1m).toBe(count === 252 ? 0 : null);
  expect(facts.maxDrawdown1y).toBe(count === 252 ? 0 : null);
});

it("does not report truncated country weights as a complete portfolio", async () => {
  const db = { query: async (sql: string) => {
    if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", name: "Plain", instrument_type: "ETF" }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: [{ holdings_count: 10 }] };
    if (sql.includes("FROM etf_holdings")) return { rows: Array.from({ length: 10 }, () => ({ listing_key: "X", country: "United States", weight_pct: 3 })) };
    return { rows: [] };
  } };
  expect((await readEtfScoreFacts("X", "2026-11-12", db as never))?.maxCountryWeightPct).toBeNull();
});

it("selects a benchmark from exposure, never the trading venue", () => {
  expect(benchmarkSymbol({ region: "US", listing_region: "EU" })).toBe("GSPC.INDX");
  expect(benchmarkSymbol({ region: "Global", listing_region: "EU" })).toBeNull();
  expect(benchmarkSymbol({ region: "Europe", listing_region: "US" })).toBe("STOXX50E.INDX");
  expect(benchmarkSymbol({ region: "Global", score_category: "US Equity", listing_region: "EU" })).toBeNull();
  expect(benchmarkSymbol({ listing_region: "US" })).toBeNull();
});

it("uses fund stats category and UCITS hint, without treating a world region as country concentration", async () => {
  const db = { query: async (sql: string) => {
    if (sql.includes("FROM etf_catalog")) return { rows: [{ listing_key: "X", name: "World ETF", instrument_type: "ETF", region: "Global", listing_region: "EU", score_category: "Catalog category", last_seen: "2026-11-12", ucits_hint: true }] };
    if (sql.includes("FROM etf_fund_stats")) return { rows: [{ listing_key: "X", category: "World Equity", ucits_hint: true, ter_ambiguous: true }] };
    if (sql.includes("FROM etf_exposure")) return { rows: [{ listing_key: "X", kind: "region", label: "North America", weight_pct: 72 }] };
    return { rows: [] };
  } };
  const facts = (await readEtfScoreFacts("X", "2026-11-12", db as never))!;
  expect(facts).toMatchObject({ category: "World Equity", ucitsConfirmed: true, terGapReason: "ter_ambiguous", maxCountryWeightPct: 72, countryConcentrationWeightPct: null });
  expect(etfScore(facts).concentration.concentrated).toBe(false);
});

it("shows the latest v2 row until a v3 score exists", async () => {
  let sql = "";
  const db = { query: async (query: string) => { sql = query; return { rows: [{ listing_key: "X", rules_version: "etf-v2-2026-11-12", rule_hits: [], earned: 25, evidenced_max: 35, state: "rated", rejections: [], concentration: null }] }; } };
  const score = (await latestEtfScores(["X"], db as never)).get("X");
  expect(sql).toContain("rules_version IN ($2,'etf-v2-2026-11-12')");
  expect(score?.rulesVersion).toBe("etf-v2-2026-11-12");
  expect(score?.incompleteData).toBe(false);
});
