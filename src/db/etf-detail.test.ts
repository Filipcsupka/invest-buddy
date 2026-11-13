import { describe, expect, it } from "vitest";
import type pg from "pg";
import iwda from "../jobs/fixtures/eodhd-etf/iwda-etf.json";
import spy from "../jobs/fixtures/eodhd-etf/spy-etf.json";
import spyDividends from "../jobs/fixtures/eodhd-etf/spy-div.json";
import { MAX_STORED_HOLDINGS, etfDetailView, etfListStats, mapStats, parseEtfData, storeEtfDetail, upsertEtfDividends } from "./etf-detail";

describe("parseEtfData (live responses captured 2026-11-06, trimmed)", () => {
  it("maps SPY.US: fraction expense ratio, percent yield, full holdings count and exposure", () => {
    const data = parseEtfData(spy)!;
    expect(data).toMatchObject({ isin: "US78462F1030", tradingCurrency: "USD", type: "ETF", yieldPct: 1, dividendFrequency: "Quarterly", inceptionDate: "1993-01-22", ongoingChargePct: null, holdingsCount: 501, holdingsListed: 12 });
    expect(data.netExpenseRatioPct).toBeCloseTo(0.09, 6);
    expect(data.totalAssets).toBe(818538753039);
    expect(data.ret1yPct).toBe(14.2171);
    expect(data.holdings[0]).toMatchObject({ position: 1, key: "NVDA.US", symbol: "NVDA", exchange: "US", weightPct: 7.8879, sector: "Technology" });
    expect(data.exposure.filter((row) => row.kind === "sector")).toHaveLength(11);
    expect(data.exposure.find((row) => row.kind === "asset" && row.label === "Stock US")?.weightPct).toBe(103.7016);
    expect(data).toMatchObject({ category: "US Equity", openFigi: "BBG000BDTBL9", indexName: "S&P 500 Index", totalAssetsCurrency: "unknown" });
    expect(data.payload).toHaveProperty("ETF_Data.Holdings");
    expect(data.payload).toHaveProperty("General.Category", "US Equity");
  });

  it("keeps IWDA.AS gaps as null instead of zero", () => {
    const data = parseEtfData(iwda)!;
    expect(data).toMatchObject({ isin: "IE00B4L5Y983", tradingCurrency: "EUR", yieldPct: null, dividendFrequency: null, netExpenseRatioPct: null, ongoingChargePct: 0.1974, holdingsCount: 10, holdingsListed: 10 });
    // Fixed_Income and Valuations_Growth were all zero or null: no credit rows are invented.
    expect(data.exposure.some((row) => row.kind === "credit")).toBe(false);
    expect(data.exposure.filter((row) => row.kind === "mcap").map((row) => row.label)).toContain("Micro");
  });

  it("treats missing and zero multi-year returns as unknown", () => {
    const parsed = parseEtfData({ ETF_Data: { Performance: { Returns_3Y: 0, Returns_5Y: null, Returns_10Y: 8.5 } } })!;
    expect([parsed.ret3yPct, parsed.ret5yPct, parsed.ret10yPct]).toEqual([null, null, 8.5]);
    const stored = mapStats({ vendor_symbol: "TEST.US", ret_3y_pct: "0", ret_5y_pct: null, ret_10y_pct: "8.5" });
    expect([stored.ret3yPct, stored.ret5yPct, stored.ret10yPct]).toEqual([null, null, 8.5]);
  });

  it("drops an all-zero map, rejects a response without ETF_Data and caps stored holdings", () => {
    expect(parseEtfData({ General: { Type: "Common Stock" } })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: MAX_STORED_HOLDINGS + 5 }, (_, i) => [`H${i}.US`, { Code: `H${i}`, "Assets_%": i / 1000 }]));
    const data = parseEtfData({ ETF_Data: { Holdings: many, World_Regions: { Japan: { "Equity_%": 0 } }, Yield: "", TotalAssets: 0 } })!;
    expect(data.holdings).toHaveLength(MAX_STORED_HOLDINGS);
    expect(data.holdingsListed).toBe(MAX_STORED_HOLDINGS + 5);
    expect(data.holdings[0].key).toBe(`H${MAX_STORED_HOLDINGS + 4}.US`);
    expect(data.exposure).toEqual([]);
    expect(data.yieldPct).toBeNull();
    expect(data.totalAssets).toBeNull();
    expect(Object.keys((data.payload.ETF_Data as Record<string, unknown>).Holdings as object)).toHaveLength(MAX_STORED_HOLDINGS + 5);
  });

  it("captures bond facts and technicals while flagging ambiguous TER", () => {
    const data = parseEtfData({ General: { Type: "ETF", Category: "Bond", CurrencyCode: "EUR" }, Technicals: { Beta: 0, "52WeekHigh": 104, "52WeekLow": 92 }, ETF_Data: {
      NetExpenseRatio: 0.02, TotalAssetsCurrency: "GBP", Average_Mkt_Cap_Mil: "1200", AnnualHoldingsTurnover: "15",
      Fixed_Income: { EffectiveDuration: { "Fund_%": 4.2 }, ModifiedDuration: { "Fund_%": 4.4 }, YieldToMaturity: { "Fund_%": 3.1 }, Coupon: { "Fund_%": 2.5 }, EffectiveMaturity: { "Fund_%": 5.8 } },
    } })!;
    expect(data).toMatchObject({ totalAssetsCurrency: "GBP", terAmbiguous: true, netExpenseRatioPct: null,
      averageMktCapMil: 1200, annualHoldingsTurnover: 15, effectiveDuration: 4.2, modifiedDuration: 4.4,
      yieldToMaturity: 3.1, coupon: 2.5, effectiveMaturity: 5.8, week52High: 104, week52Low: 92, beta: null });
    expect(data.payload).toHaveProperty("Technicals.52WeekHigh", 104);
  });
});

function recordingClient() {
  const sql: { text: string; values: unknown[] }[] = [];
  const client = { query: async (text: string, values: unknown[] = []) => { sql.push({ text, values }); return { rows: [], rowCount: 0 }; }, release: () => undefined };
  return { sql, db: { connect: async () => client } as unknown as Pick<pg.Pool, "connect">, query: client.query };
}

describe("writers", () => {
  it("replaces the holdings and exposure snapshot inside one transaction, display restricted", async () => {
    const { sql, db } = recordingClient();
    const stored = await storeEtfDetail(db, { listingKey: "NYSEARCA:SPY", vendorSymbol: "SPY.US", asOf: "2026-11-06", origin: "job", data: parseEtfData(spy)! });
    expect(stored.holdings).toBe(12);
    expect(sql[0].text).toBe("BEGIN");
    expect(sql[1].text).toContain("INSERT INTO etf_fund_stats");
    expect(sql[1].values.at(-1)).toBe(false);
    expect(sql[1].text).toContain("total_assets_currency");
    expect(sql[1].values[7]).toBe("USD");
    expect(Math.max(...[...sql[1].text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))).toBe(sql[1].values.length);
    expect(sql[1].values[38]).toBeNull();
    expect(sql.find((row) => row.text.startsWith("DELETE FROM etf_holdings"))?.values).toEqual(["NYSEARCA:SPY"]);
    expect(sql.at(-1)?.text).toBe("COMMIT");
  });

  it("keeps a catalog UCITS hint separate from confirmed status", async () => {
    const { sql, db } = recordingClient();
    await storeEtfDetail(db, { listingKey: "IE00B4L5Y983", vendorSymbol: "IWDA.AS", asOf: "2026-11-06", origin: "enrich", data: parseEtfData(iwda)!, ucitsHint: true });
    expect(sql[1].values[7]).toBe("unknown");
    expect(sql[1].values[38]).toBe(true);
  });

  it("upserts dividends by ex-date and skips invalid dates", async () => {
    const { sql, query } = recordingClient();
    const saved = await upsertEtfDividends({ query } as unknown as Pick<pg.Pool, "query">, "SPY.US", [...spyDividends, { date: "n/a", value: 1 }]);
    expect(saved).toBe(3);
    expect(sql[0].values.slice(0, 5)).toEqual(["SPY.US", "2025-03-21", 1.69553, 1.69553, "USD"]);
    expect(sql[0].values.at(-1)).toBe(false);
  });
});

describe("read models", () => {
  it("returns an empty view without a database", async () => {
    expect(await etfDetailView("X:Y", {}, null)).toMatchObject({ stats: null, holdings: [], dividends: [], bars: [] });
    expect((await etfListStats(["X:Y"], null)).size).toBe(0);
  });

  it("bounds every query and maps numeric strings", async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const db = { query: async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      if (text.includes("FROM etf_fund_stats")) return { rows: [{ as_of: "2026-11-06", vendor_symbol: "SPY.US", origin: "job", yield_pct: "1", ret_1y_pct: "14.2", holdings_count: 501, holdings_listed: 501, fetched_at: new Date("2026-11-06T01:00:00Z") }] };
      if (text.includes("FROM etf_tracked")) return { rows: [{ vendor_symbol: "SPY.US", currency: "USD" }] };
      if (text.includes("FROM etf_exposure")) return { rows: [{ kind: "region", label: "North America", weight_pct: "99.1" }, { kind: "bogus", label: "x", weight_pct: 1 }] };
      if (text.includes("FROM asset_bars")) return { rows: [{ bar_date: "2026-11-05", open: null, high: null, low: null, close: "600.5", volume: null }] };
      return { rows: [] };
    } } as unknown as Pick<pg.Pool, "query">;
    const view = await etfDetailView("NYSEARCA:SPY", { holdingsLimit: 99999, barDays: 99999 }, db);
    expect(view.stats).toMatchObject({ yieldPct: 1, ret1yPct: 14.2, ongoingChargePct: null, holdingsCount: 501 });
    expect(view.exposure.region).toEqual([{ label: "North America", weightPct: 99.1 }]);
    expect(view.bars).toEqual([{ date: "2026-11-05", open: 600.5, high: 600.5, low: 600.5, close: 600.5, volume: 0 }]);
    expect(calls.find((call) => call.text.includes("FROM etf_holdings"))?.values[1]).toBe(MAX_STORED_HOLDINGS);
    expect(calls.find((call) => call.text.includes("FROM asset_bars"))?.values[1]).toBe(2000);
  });
});
