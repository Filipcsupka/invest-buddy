import { describe, expect, it } from "vitest";
import bulkFixture from "../data-providers/eodhd/fixtures/bulk-eod.json";
import historyFixture from "../data-providers/eodhd/fixtures/eod.json";
import type { BulkLastDayBar, BulkSplit, EodBar, Split } from "../data-providers/eodhd/client";
import { insertMemoryCorporateActions } from "../db/corporate-actions";
import type { CorporateAction } from "../data/corporate-actions";
import { MemoryPriceRepository } from "../db/prices";
import { rawBar, barsFromHistory, loadEodhdPriceSymbols, runEodhdPrices, splitActions, type PriceSymbol } from "./eodhd-prices";

const costs = (eod = 0, splits = 0, bulk = 0) => ({ "exchanges-list": 0, "exchange-symbol-list": 0, eod, splits, "eod-bulk-last-day": bulk, fundamentals: 0, "calendar/earnings": 0, news: 0, "sec-filings/form4": 0 });
const symbols: PriceSymbol[] = [
  { ticker: "MSFT", vendorSymbol: "MSFT.US", exchange: "US", code: "MSFT", currency: "USD" },
  { ticker: "NVDA", vendorSymbol: "NVDA.US", exchange: "US", code: "NVDA", currency: "USD" },
];
const noBulk = async () => { throw new Error("bulk should not be called"); };

describe("EODHD prices", () => {
  it("stores raw OHLC and reverses split adjustments in reported volume without dividend look-ahead", () => {
    expect(rawBar(historyFixture[0])).toEqual({ date: "2024-01-02", open: 295.05, high: 297.28, low: 295.05, close: 297.04, volume: 4458400 });
    expect(rawBar({ date: "2026-10-20", open: 200, high: 210, low: 190, close: 205, adjusted_close: 102.5, volume: 1000 })).toMatchObject({ close: 205, volume: 1000 });
    expect(rawBar({ date: "2026-10-20", open: 1, high: 2, low: 1, close: 1.5, volume: 10 })).toMatchObject({ close: 1.5 });
    expect(() => rawBar({ date: "2026-10-20", open: 1, high: 2, low: 1, close: null, volume: 10 })).toThrow(/raw/);
    const actions = splitActions("MSFT", [{ date: "2024-01-03", split: "4.000000/1.000000" }, { date: "2024-01-04", split: "1.000000/8.000000" }]);
    expect(actions.map((a) => [a.kind, a.ratio, a.detectedBy])).toEqual([["split", 4, "vendor"], ["reverse_split", 0.125, "vendor"]]);
    const prior = [{ ...actions[0], ratio: 2, detectedBy: "heuristic" as const }];
    expect(insertMemoryCorporateActions(prior, [actions[0]])).toBe(1);
    expect(prior[0]).toEqual(actions[0]);
    expect(insertMemoryCorporateActions(prior, [actions[0]])).toBe(0);
    expect(barsFromHistory([...historyFixture].reverse(), actions).map((b) => b.volume)).toEqual([4458400 / 0.5, 3114800 / 0.125]);
    expect(() => splitActions("X", [{ date: "2024-01-03", split: "bad" }])).toThrow(/split ratio/);
  });

  it("uses individual EOD and splits for small daily groups and stores vendor actions", async () => {
    const requested: string[] = [];
    const row = bulkFixture[0] as BulkLastDayBar;
    const client = { eod: async (symbol: string) => { requested.push(`eod:${symbol}`); return [row] as EodBar[]; },
      splits: async (symbol: string) => { requested.push(`splits:${symbol}`); return [{ date: row.date, split: "2.000000/1.000000" }] as Split[]; },
      eodBulkLastDay: noBulk, getCallCosts: () => costs(2, 2) };
    const repo = new MemoryPriceRepository();
    const actions: CorporateAction[] = [];
    const result = await runEodhdPrices(client, repo, symbols, { mode: "daily", recordActions: async (rows) => { insertMemoryCorporateActions(actions, rows); } });
    expect(requested).toEqual(["eod:MSFT.US", "splits:MSFT.US", "eod:NVDA.US", "splits:NVDA.US"]);
    expect(result).toMatchObject({ requested: 2, succeeded: 2, failed: 0, barsWritten: 2, callCost: 4 });
    expect(repo.provenance.get("MSFT")).toEqual({ sourceId: "eodhd", vendorSymbol: "MSFT.US", currency: "USD" });
    expect(repo.bars.get("MSFT")?.get(row.date)?.close).toBe(row.close);
    expect(actions).toMatchObject([{ ticker: "MSFT", ratio: 2, sourceId: "eodhd", detectedBy: "vendor" }, { ticker: "NVDA", ratio: 2 }]);
    expect((await runEodhdPrices(client, repo, symbols, { mode: "daily", dryRun: true })).barsWritten).toBe(0);
    expect(repo.runs).toHaveLength(1);
  });

  it("uses bulk prices and splits when an exchange has 100 tracked names", async () => {
    const tracked = Array.from({ length: 100 }, (_, i): PriceSymbol => ({ ticker: `T${i}`, vendorSymbol: `T${i}.US`, exchange: "US", code: `T${i}`, currency: "USD" }));
    const requests: string[] = [];
    const row = bulkFixture[0] as BulkLastDayBar;
    const client = { eod: async () => { throw new Error("individual EOD should not be called"); }, splits: async () => { throw new Error("individual splits should not be called"); },
      eodBulkLastDay: async (_exchange: string, options: { type?: string }) => { requests.push(options.type ?? "eod"); return options.type === "splits" ? [{ code: "T0", exchange: "US", date: row.date, split: "2.000000/1.000000" }] as BulkSplit[] : tracked.map((s) => ({ ...row, code: s.code })); },
      getCallCosts: () => costs(0, 0, 200) };
    const result = await runEodhdPrices(client as never, new MemoryPriceRepository(), tracked, { mode: "daily" });
    expect(requests).toEqual(["eod", "splits"]);
    expect(result).toMatchObject({ requested: 100, succeeded: 100, failed: 0, callCost: 200 });
  });

  it("backfills history and refuses a shorter replacement", async () => {
    const client = { eod: async () => historyFixture as EodBar[], splits: async () => [] as Split[], eodBulkLastDay: noBulk, getCallCosts: () => costs(1, 1) };
    const repo = new MemoryPriceRepository();
    const first = await runEodhdPrices(client, repo, [symbols[0]], { mode: "backfill" });
    expect(first).toMatchObject({ succeeded: 1, barsWritten: 2, insufficientHistory: ["MSFT"] });
    expect(repo.bars.get("MSFT")?.get("2024-01-02")?.close).toBe(297.04);
    const shortClient = { ...client, eod: async () => [historyFixture[0]] as EodBar[] };
    await expect(runEodhdPrices(shortClient, repo, [symbols[0]], { mode: "backfill" })).resolves.toMatchObject({ failed: 1, barsWritten: 0 });
    expect(repo.bars.get("MSFT")?.size).toBe(2);
  });

  it("records one failed symbol and still writes the next when its splits request fails", async () => {
    const row = bulkFixture[0] as EodBar;
    const repo = new MemoryPriceRepository();
    const result = await runEodhdPrices({ eod: async () => [row], splits: async (symbol: string) => {
      if (symbol === "MSFT.US") throw new Error("splits unavailable");
      return [];
    }, eodBulkLastDay: noBulk, getCallCosts: () => costs(2, 2) }, repo, symbols, { mode: "daily" });
    expect(result).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(result.failures).toEqual([{ ticker: "MSFT", reason: "splits unavailable" }]);
    expect(repo.bars.has("MSFT")).toBe(false);
    expect(repo.bars.has("NVDA")).toBe(true);
  });

  it("resolves exchange collisions by explicit mapping, home hint, then US and continues past unresolved names", async () => {
    const db = { query: async (sql: string) => sql.includes("vendor_symbols")
      ? { rows: [{ ticker: "BMW", vendor_symbols: { eodhd: "BMW.XETRA" } }] }
      : sql.includes("SELECT ticker,exchange") ? { rows: [{ ticker: "CDR", exchange: "WAR" }, { ticker: "BAD", exchange: "LSE" }] }
      : { rows: [
        { vendor_symbol: "BMW.XETRA", code: "BMW", exchange: "XETRA", currency: "EUR" }, { vendor_symbol: "BMW.US", code: "BMW", exchange: "US", currency: "USD" },
        { vendor_symbol: "CDR.WAR", code: "CDR", exchange: "WAR", currency: "PLN" }, { vendor_symbol: "CDR.US", code: "CDR", exchange: "US", currency: "USD" },
        { vendor_symbol: "MSFT.US", code: "MSFT", exchange: "US", currency: "USD" }, { vendor_symbol: "MSFT.XETRA", code: "MSFT", exchange: "XETRA", currency: "EUR" },
        { vendor_symbol: "SAP.XETRA", code: "SAP", exchange: "XETRA", currency: "EUR" },
        { vendor_symbol: "ABC.US", code: "ABC", exchange: "US", currency: "USD" }, { vendor_symbol: "ABC.LSE", code: "ABC", exchange: "LSE", currency: "GBP" },
        { vendor_symbol: "BAD.US", code: "BAD", exchange: "US", currency: "USD" },
      ] } };
    const mapped = await loadEodhdPriceSymbols(db as never, ["BMW", "CDR", "MSFT", "SAP.XETRA", "ABC.US", "ABC.LSE", "BAD", "MISSING"]);
    expect(mapped.symbols.map((s) => s.vendorSymbol)).toEqual(["BMW.XETRA", "CDR.WAR", "MSFT.US", "SAP.XETRA", "ABC.US", "ABC.LSE"]);
    expect(mapped.unmapped).toEqual(["BAD", "MISSING"]);
    const result = await runEodhdPrices({ eod: async () => [bulkFixture[0]], splits: async () => [], eodBulkLastDay: noBulk, getCallCosts: () => costs(3, 3) }, new MemoryPriceRepository(), mapped.symbols, { mode: "daily", unmapped: mapped.unmapped });
    expect(result).toMatchObject({ requested: 8, succeeded: 6, failed: 2 });
    expect(result.failures.map((f) => f.ticker)).toEqual(["BAD", "MISSING"]);
  });
});
