import { describe, expect, it } from "vitest";
import { MemoryPriceRepository } from "../db/prices";
import { runEodhdPricesWithCallLog, type PriceSymbol } from "./eodhd-prices";
import { runEodhdFundamentals } from "./eodhd-fundamentals";
import { runEodhdInsider } from "./eodhd-insider";
import { runEodhdCatalyst } from "./eodhd-catalyst";
import { syncSymbols } from "./symbols-sync";
import { runUniverseSeedWithCallLog, type SeedListing } from "./eodhd-universe-seed";

function database() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = { async query(sql: string, params: unknown[] = []) { queries.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
  const logged = () => queries.filter(({ sql }) => sql.includes("INSERT INTO eodhd_call_log")).map(({ params }) => params);
  return { db: db as never, logged };
}

describe("EODHD call accounting", () => {
  it("records price calls and skips dry-run writes", async () => {
    const { db, logged } = database();
    const symbol: PriceSymbol = { ticker: "MSFT", vendorSymbol: "MSFT.US", exchange: "US", code: "MSFT", currency: "USD" };
    const api = {
      eod: async () => [{ date: "2026-11-26", open: 1, high: 1, low: 1, close: 1, volume: 10 }],
      splits: async () => [],
      eodBulkLastDay: async () => [],
      getCallCosts: () => ({ eod: 1, splits: 1 }),
    };
    await runEodhdPricesWithCallLog(db, api as never, new MemoryPriceRepository(), [symbol], { mode: "daily" });
    await runEodhdPricesWithCallLog(db, api as never, new MemoryPriceRepository(), [symbol], { mode: "daily", dryRun: true });
    expect(logged()).toEqual([["eodhd-prices", 2]]);
  });

  it("records calendar attempts when fundamentals fails", async () => {
    const { db, logged } = database();
    const api = {
      earningsCalendar: async () => { throw new Error("calendar unavailable"); },
      fundamentals: async () => { throw new Error("unused"); },
      getCallCosts: () => ({ "calendar/earnings": 1 }),
    };
    await expect(runEodhdFundamentals(db, api as never, { subjects: [{ ticker: "AAPL", vendorSymbol: "AAPL.US" }] })).rejects.toThrow("calendar unavailable");
    expect(logged()).toEqual([["eodhd-fundamentals", 1]]);
  });

  it("records failed insider requests and skips dry-run writes", async () => {
    const { db, logged } = database();
    const subject = { ticker: "AAPL", vendorSymbol: "AAPL.US", secCheckedAt: null, vendorCheckedAt: null, secFailed: true };
    const api = { form4: async () => { throw new Error("request failed"); }, getCallCosts: () => ({ "sec-filings/form4": 10 }) };
    await runEodhdInsider(db, api, { subjects: [subject], today: "2026-11-26" });
    await runEodhdInsider(db, api, { subjects: [subject], today: "2026-11-26", dryRun: true });
    expect(logged()).toEqual([["eodhd-insider", 10]]);
  });

  it("records failed catalyst requests and skips dry-run writes", async () => {
    const { db, logged } = database();
    const api = { news: async () => { throw new Error("request failed"); }, getCallCosts: () => ({ news: 5 }) };
    const options = { subjects: [{ ticker: "AAPL", vendorSymbol: "AAPL.US", score: 20 }], calendarRows: [] };
    await runEodhdCatalyst(db, api, options);
    await runEodhdCatalyst(db, api, { ...options, dryRun: true });
    expect(logged()).toEqual([["eodhd-catalyst", 5]]);
  });

  it("records symbols sync calls even without a listed exchange", async () => {
    const { db, logged } = database();
    const api = { exchangesList: async () => [], exchangeSymbolList: async () => [], getCallCosts: () => ({ "exchanges-list": 1 }) };
    await syncSymbols(db, api, "2026-11-26");
    expect(logged()).toEqual([["symbols-sync", 1]]);
  });

  it("records seed calls and skips dry-run writes", async () => {
    const { db, logged } = database();
    const listing: SeedListing = { vendorSymbol: "SAP.XETRA", code: "SAP", exchange: "XETRA", name: "SAP", currency: "EUR", type: "Common Stock" };
    const store = { readySymbols: async () => new Set<string>(), fxRates: async () => new Map([["ECB_EURUSD", { value: 1.2, date: "2026-11-26" }]]), save: async () => undefined };
    const api = { eodBulkLastDay: async () => [], eod: async () => [], splits: async () => [], fundamentals: async () => ({}), getCallCosts: () => ({ "eod-bulk-last-day": 100 }) };
    const options = { topPerExchange: 1, maxCalls: 200, minPrice: 5, today: "2026-11-26" };
    await runUniverseSeedWithCallLog(db, api as never, store as never, [listing], options);
    await runUniverseSeedWithCallLog(db, api as never, store as never, [listing], { ...options, dryRun: true });
    expect(logged()).toEqual([["eodhd-universe-seed", 100]]);
  });
});
