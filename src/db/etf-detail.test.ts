import { describe, expect, it } from "vitest";
import type pg from "pg";
import iwda from "../jobs/fixtures/eodhd-etf/iwda-etf.json";
import spy from "../jobs/fixtures/eodhd-etf/spy-etf.json";
import spyDividends from "../jobs/fixtures/eodhd-etf/spy-div.json";
import { MAX_STORED_HOLDINGS, etfDetailView, etfListStats, etfPayloadRoot, markEtfFetched, mapStats, parseEtfData, storeEtfDetail, totalAssetsCurrency, upsertEtfDividends } from "./etf-detail";

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
    expect(data).toMatchObject({ category: "US Equity", openFigi: "BBG000BDTBL9", indexName: "S&P 500 Index", totalAssetsCurrency: null });
    // Every Fixed_Income key is {"Fund_%": 0} for this equity fund: stored as unknown, not zero.
    expect(data).toMatchObject({ effectiveDuration: null, modifiedDuration: null, yieldToMaturity: null, coupon: null, effectiveMaturity: null });
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

  it("keeps a real zero inside a bond block that has other values", () => {
    const data = parseEtfData({ ETF_Data: { Fixed_Income: { EffectiveDuration: { "Fund_%": 19.5 }, Coupon: { "Fund_%": 0 }, YieldToMaturity: { "Fund_%": "0" } } } })!;
    expect(data).toMatchObject({ effectiveDuration: 19.5, coupon: 0, yieldToMaturity: 0, modifiedDuration: null, effectiveMaturity: null });
    expect(parseEtfData({ ETF_Data: { Fixed_Income: { Coupon: { "Fund_%": 0 }, EffectiveDuration: { "Fund_%": null } } } })!.coupon).toBeNull();
  });

  it("states the AUM currency only when it is known", () => {
    expect(totalAssetsCurrency(parseEtfData(spy)!, "SPY.US")).toBe("USD");
    expect(totalAssetsCurrency(parseEtfData(iwda)!, "IWDA.AS")).toBeNull();
    expect(totalAssetsCurrency({ totalAssetsCurrency: null, tradingCurrency: "EUR" }, "XYZ.US")).toBeNull();
    expect(totalAssetsCurrency({ totalAssetsCurrency: "GBP", tradingCurrency: "EUR" }, "IWDA.AS")).toBe("GBP");
  });

  it("reads both stored payload shapes", () => {
    const bare = { ISIN: "IE00B4L5Y983", Holdings_Count: 10 };
    expect(etfPayloadRoot(bare)).toEqual({ ETF_Data: bare });
    expect(etfPayloadRoot(spy)).toBe(spy);
    expect(etfPayloadRoot(null)).toBeNull();
    expect(parseEtfData(etfPayloadRoot(bare))?.isin).toBe("IE00B4L5Y983");
  });
});

/** Value bound to one etf_fund_stats column, by name rather than position. */
function statsValue(row: { text: string; values: unknown[] }, column: string): unknown {
  const columns = /INSERT INTO etf_fund_stats \(([^)]*)\)/.exec(row.text)![1].split(",").map((item) => item.trim());
  const tokens = /VALUES \(([^]*?)\)\s*ON CONFLICT/.exec(row.text)![1].split(",").map((item) => item.trim());
  expect(columns).toHaveLength(tokens.length);
  const token = tokens[columns.indexOf(column)];
  return /^\$\d+$/.test(token) ? row.values[Number(token.slice(1)) - 1] : token;
}

function recordingClient() {
  const sql: { text: string; values: unknown[] }[] = [];
  const client = { query: async (text: string, values: unknown[] = []) => { sql.push({ text, values }); return { rows: [], rowCount: 0 }; }, release: () => undefined };
  return { sql, db: { connect: async () => client } as unknown as Pick<pg.Pool, "connect">, query: client.query };
}

describe("writers", () => {
  it("marks only the completed collection part", async () => {
    const { sql, query } = recordingClient();
    await markEtfFetched({ query } as unknown as Pick<pg.Pool, "query">, "NYSEARCA:SPY", "dividends");
    expect(sql[0].text).toContain("dividends_fetched_at=CASE WHEN $2='dividends'");
    expect(sql[0].values).toEqual(["NYSEARCA:SPY", "dividends", "ok"]);
    await markEtfFetched({ query } as unknown as Pick<pg.Pool, "query">, "NYSEARCA:SPY", "fundamentals", "isin_mismatch");
    expect(sql[1].values).toEqual(["NYSEARCA:SPY", "fundamentals", "isin_mismatch"]);
  });

  it("replaces the holdings and exposure snapshot inside one transaction, display restricted", async () => {
    const { sql, db } = recordingClient();
    const stored = await storeEtfDetail(db, { listingKey: "NYSEARCA:SPY", vendorSymbol: "SPY.US", asOf: "2026-11-06", origin: "job", data: parseEtfData(spy)! });
    expect(stored.holdings).toBe(12);
    expect(sql[0].text).toBe("BEGIN");
    expect(sql[1].text).toContain("INSERT INTO etf_fund_stats");
    expect(sql[1].values.at(-1)).toBe(false);
    expect(sql[1].text).toContain("total_assets_currency");
    expect(statsValue(sql[1], "total_assets_currency")).toBe("USD");
    expect(statsValue(sql[1], "effective_duration")).toBeNull();
    expect(Math.max(...[...sql[1].text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))).toBe(sql[1].values.length);
    expect(statsValue(sql[1], "ucits_hint")).toBeNull();
    expect(sql.find((row) => row.text.startsWith("DELETE FROM etf_holdings"))?.values).toEqual(["NYSEARCA:SPY"]);
    expect(sql.at(-1)?.text).toBe("COMMIT");
  });

  it("keeps a catalog UCITS hint separate from confirmed status", async () => {
    const { sql, db } = recordingClient();
    await storeEtfDetail(db, { listingKey: "IE00B4L5Y983", vendorSymbol: "IWDA.AS", asOf: "2026-11-06", origin: "enrich", data: parseEtfData(iwda)!, ucitsHint: true });
    expect(statsValue(sql[1], "total_assets_currency")).toBeNull();
    expect(statsValue(sql[1], "ucits_hint")).toBe(true);
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
  it("skips unused datasets for an exposure-only tab", async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ kind: "sector", label: "Technology", weight_pct: 30 }] }; } } as unknown as Pick<pg.Pool, "query">;
    const view = await etfDetailView("NYSEARCA:SPY", { stats: false, holdings: false, exposure: true, dividends: false, bars: false }, db);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("FROM etf_exposure");
    expect(view.exposure.sector).toEqual([{ label: "Technology", weightPct: 30 }]);
  });

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
