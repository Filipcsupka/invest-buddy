import { describe, expect, it } from "vitest";
import bulkFixture from "../data-providers/eodhd/fixtures/bulk-eod.json";
import historyFixture from "../data-providers/eodhd/fixtures/eod.json";
import type { BulkLastDayBar, EodBar } from "../data-providers/eodhd/client";
import { fixtureBars, fixtureFundamentals, fixtureMacro } from "../data/fixtures";
import { computeTechnicals } from "../data/technicals";
import { MemoryPriceRepository } from "../db/prices";
import { score, technicalIndicators } from "../engine";
import { adjustedBar, barsFromHistory, loadEodhdPriceSymbols, parseEodhdPriceArgs, runEodhdPrices, type PriceSymbol } from "./eodhd-prices";

const costs = (eod = 0, bulk = 0) => ({ "exchanges-list": 0, "exchange-symbol-list": 0, eod, "eod-bulk-last-day": bulk, fundamentals: 0, "calendar/earnings": 0, news: 0, "sec-filings/form4": 0 });
const symbols: PriceSymbol[] = [
  { ticker: "MSFT", vendorSymbol: "MSFT.US", exchange: "US", code: "MSFT", currency: "USD" },
  { ticker: "NVDA", vendorSymbol: "NVDA.US", exchange: "US", code: "NVDA", currency: "USD" },
];

describe("EODHD prices", () => {
  it("converts adjusted close to a consistent adjusted candle and retains volume", () => {
    const bar = adjustedBar(historyFixture[0]);
    const factor = historyFixture[0].adjusted_close / historyFixture[0].close;
    expect(bar).toEqual({ date: "2024-01-02", open: historyFixture[0].open * factor, high: historyFixture[0].high * factor,
      low: historyFixture[0].low * factor, close: historyFixture[0].adjusted_close, volume: 4458400 });
    const split = adjustedBar({ date: "2026-10-20", open: 200, high: 210, low: 190, close: 205, adjusted_close: 102.5, volume: 1000 });
    expect(split).toEqual({ date: "2026-10-20", open: 100, high: 105, low: 95, close: 102.5, volume: 1000 });
    expect(() => adjustedBar({ date: "2026-10-20", open: 1, high: 2, low: 1, close: 1.5, volume: 10 })).toThrow(/adjusted/);
    expect(barsFromHistory([...historyFixture].reverse()).map((b) => b.date)).toEqual(["2024-01-02", "2024-01-03"]);
  });

  it("uses one bulk request per exchange and writes mapped currency and source", async () => {
    const requested: string[] = [];
    const row = bulkFixture[0] as BulkLastDayBar;
    const client = { eod: async () => [] as EodBar[], eodBulkLastDay: async (exchange: string) => { requested.push(exchange); return [row, { ...row, code: "NVDA" }]; }, getCallCosts: () => costs(0, 100) };
    const repo = new MemoryPriceRepository();
    const result = await runEodhdPrices(client, repo, symbols, { mode: "daily" });
    expect(requested).toEqual(["US"]);
    expect(result).toMatchObject({ requested: 2, succeeded: 2, failed: 0, barsWritten: 2, callCost: 100 });
    expect(repo.provenance.get("MSFT")).toEqual({ sourceId: "eodhd", vendorSymbol: "MSFT.US", currency: "USD" });
    expect(repo.bars.get("MSFT")?.get(row.date)?.close).toBe(row.adjusted_close);
    await repo.upsertBars("MSFT", [adjustedBar(row)], { sourceId: "twelvedata", vendorSymbol: "MSFT" });
    expect((await runEodhdPrices(client, repo, [symbols[0]], { mode: "daily" })).barsWritten).toBe(1);
    expect(repo.provenance.get("MSFT")?.sourceId).toBe("eodhd");
    expect((await runEodhdPrices(client, repo, symbols, { mode: "daily", dryRun: true })).barsWritten).toBe(0);
    expect(repo.runs).toHaveLength(2);
  });

  it("backfills full history per vendor symbol and refuses a shorter replacement", async () => {
    const requested: string[] = [];
    const client = { eod: async (symbol: string) => { requested.push(symbol); return historyFixture as EodBar[]; }, eodBulkLastDay: async () => [] as BulkLastDayBar[], getCallCosts: () => costs(1) };
    const repo = new MemoryPriceRepository();
    const first = await runEodhdPrices(client, repo, [symbols[0]], { mode: "backfill" });
    expect(requested).toEqual(["MSFT.US"]);
    expect(first).toMatchObject({ succeeded: 1, barsWritten: 2, insufficientHistory: ["MSFT"] });
    expect(repo.bars.get("MSFT")?.size).toBe(2);
    const shortClient = { ...client, eod: async () => [historyFixture[0]] as EodBar[] };
    await expect(runEodhdPrices(shortClient, repo, [symbols[0]], { mode: "backfill" })).resolves.toMatchObject({ failed: 1, barsWritten: 0 });
    expect(repo.bars.get("MSFT")?.size).toBe(2);
  });

  it("maps only unambiguous active symbols, with explicit vendor symbols taking priority", async () => {
    const db = { query: async (sql: string) => sql.includes("instrument_ids")
      ? { rows: [{ ticker: "BMW", vendor_symbols: { eodhd: "BMW.XETRA" } }] }
      : { rows: [
        { vendor_symbol: "BMW.XETRA", code: "BMW", exchange: "XETRA", currency: "EUR" },
        { vendor_symbol: "BMW.US", code: "BMW", exchange: "US", currency: "USD" },
        { vendor_symbol: "MSFT.US", code: "MSFT", exchange: "US", currency: "USD" },
        { vendor_symbol: "DUP.US", code: "DUP", exchange: "US", currency: "USD" },
        { vendor_symbol: "DUP.XETRA", code: "DUP", exchange: "XETRA", currency: "EUR" },
      ] } };
    const result = await loadEodhdPriceSymbols(db as never, ["BMW", "MSFT", "DUP", "MISSING"]);
    expect(result.symbols.map((s) => s.vendorSymbol)).toEqual(["BMW.XETRA", "MSFT.US"]);
    expect(result.unmapped).toEqual(["DUP", "MISSING"]);
  });

  it("keeps the price rules and volume ratio identical for identical bars from either source", async () => {
    const sourceBars = fixtureBars("NVDA");
    const rows: EodBar[] = sourceBars.map((bar) => ({ ...bar, adjusted_close: bar.close }));
    const td = new MemoryPriceRepository(), eod = new MemoryPriceRepository();
    await td.upsertBars("NVDA", sourceBars, { sourceId: "twelvedata", vendorSymbol: "NVDA" });
    await runEodhdPrices({ eod: async () => rows, eodBulkLastDay: async () => [] as BulkLastDayBar[], getCallCosts: () => costs(1) }, eod, [symbols[1]], { mode: "backfill" });
    const series = (repo: MemoryPriceRepository) => [...repo.bars.get("NVDA")!.values()].sort((a, b) => a.date.localeCompare(b.date));
    const left = series(td), right = series(eod);
    const priceHits = (bars: typeof left) => score({ ticker: "NVDA", bars, fundamentals: fixtureFundamentals("NVDA"), macro: fixtureMacro("NVDA") })
      .ruleHits.filter((hit) => ["above-ma", "uptrend", "green-volume", "dip"].includes(hit.id));
    expect(right).toEqual(left);
    expect(priceHits(right)).toEqual(priceHits(left));
    expect(priceHits(right).map((hit) => hit.matched)).toEqual([false, false, true, false]);
    expect(technicalIndicators(right)).toMatchObject({ close: 124.06, volumeOnGreen: true, aboveBoth: false, uptrend: false });
    expect(technicalIndicators(right).ma50).toBeCloseTo(136.4836);
    expect(technicalIndicators(right).ma200).toBeCloseTo(147.90415);
    expect(technicalIndicators(right).drawdown20).toBeCloseTo(0.11807777);
    expect(computeTechnicals(right)).toMatchObject({ volumeRatio: 1.22, vsMa50Percent: -9.1, vsMa200Percent: -16.12 });
  });

  it("allows recorded fixtures only in dry-run mode", () => {
    expect(parseEodhdPriceArgs(["--fixture", "--dry-run", "--mode", "backfill"])).toMatchObject({ fixture: true, dryRun: true, mode: "backfill" });
    expect(() => parseEodhdPriceArgs(["--fixture"])).toThrow(/dry-run/);
  });
});
