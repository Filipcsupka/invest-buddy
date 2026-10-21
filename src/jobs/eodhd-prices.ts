import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OHLCV } from "../engine";
import type { PriceRepository, PriceRunRecord } from "../db/prices";
import { MemoryPriceRepository, PostgresPriceRepository } from "../db/prices";
import { loadUniverse } from "../db/universe";
import { loadVendorSymbols } from "../data/security-master";
import { EodhdClient, type BulkLastDayBar, type EodBar } from "../data-providers/eodhd/client";
import { runLoggedJob } from "./job-log";

export interface PriceSymbol { ticker: string; vendorSymbol: string; exchange: string; code: string; currency: string }
type EodhdPricesClient = Pick<EodhdClient, "eod" | "getCallCosts"> & { eodBulkLastDay(exchange: string, options: { filter: "extended" }): Promise<BulkLastDayBar[]> };
export type PriceMode = "daily" | "backfill";
export interface EodhdPriceOptions { mode: PriceMode; dryRun?: boolean; now?: () => Date }
export interface EodhdPriceResult extends PriceRunRecord { callCost: number; insufficientHistory: string[] }

/** EODHD's adjusted close is applied to the whole OHLC candle. Raw volume is retained. */
export function adjustedBar(row: EodBar): OHLCV {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`))) throw new Error("invalid bar date");
  const prices = [row.open, row.high, row.low, row.close, row.adjusted_close];
  if (prices.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0) || typeof row.volume !== "number" || !Number.isFinite(row.volume) || row.volume < 0) throw new Error(`invalid or incomplete adjusted bar ${row.date}`);
  const [open, high, low, close, adjustedClose] = prices as number[];
  const factor = adjustedClose / close;
  const bar = { date: row.date, open: open * factor, high: high * factor, low: low * factor, close: adjustedClose, volume: row.volume };
  if (bar.high < bar.low || bar.open < bar.low - 1e-8 || bar.open > bar.high + 1e-8 || bar.close < bar.low - 1e-8 || bar.close > bar.high + 1e-8) throw new Error(`invalid adjusted OHLC ${row.date}`);
  return bar;
}

export function barsFromHistory(rows: EodBar[]): OHLCV[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty EODHD history");
  const bars = rows.map(adjustedBar).sort((a, b) => a.date.localeCompare(b.date));
  if (bars.some((bar, i) => i > 0 && bar.date === bars[i - 1].date)) throw new Error("duplicate EODHD bar date");
  return bars;
}

/** A ticker must have an explicit vendor mapping or exactly one active symbol-master match. */
export async function loadEodhdPriceSymbols(db: pg.Pool, tickers: string[]): Promise<{ symbols: PriceSymbol[]; unmapped: string[] }> {
  const explicit = await loadVendorSymbols(db, "eodhd");
  const wanted = tickers.map((ticker) => explicit[ticker]).filter((value): value is string => Boolean(value));
  const rows = await db.query<{ vendor_symbol: string; code: string; exchange: string; currency: string | null }>(
    "SELECT vendor_symbol,code,exchange,currency FROM symbols WHERE delisted=false AND (code = ANY($1::text[]) OR vendor_symbol = ANY($2::text[]))", [tickers, wanted]);
  const symbols: PriceSymbol[] = [], unmapped: string[] = [];
  for (const ticker of tickers) {
    const candidates = rows.rows.filter((row) => explicit[ticker] ? row.vendor_symbol === explicit[ticker] : row.code === ticker);
    if (candidates.length !== 1 || !candidates[0].currency) { unmapped.push(ticker); continue; }
    const row = candidates[0];
    symbols.push({ ticker, vendorSymbol: row.vendor_symbol, exchange: row.exchange, code: row.code, currency: row.currency! });
  }
  return { symbols, unmapped };
}

export async function runEodhdPrices(client: EodhdPricesClient, repository: PriceRepository, symbols: PriceSymbol[], options: EodhdPriceOptions): Promise<EodhdPriceResult> {
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const failures: PriceRunRecord["failures"] = [];
  const insufficientHistory: string[] = [];
  let succeeded = 0, barsWritten = 0, barsRevised = 0;
  const save = async (symbol: PriceSymbol, rows: EodBar[]) => {
    try {
      const bars = barsFromHistory(rows);
      if (options.mode === "backfill") {
        const stored = await repository.countSince(symbol.ticker, bars[0].date);
        if (stored > bars.length) throw new Error(`fetched ${bars.length} bars but ${stored} are stored for the same range; kept stored bars`);
        if (bars.length < 200) insufficientHistory.push(symbol.ticker);
      }
      if (!options.dryRun) {
        const result = await repository.upsertBars(symbol.ticker, bars, { sourceId: "eodhd", vendorSymbol: symbol.vendorSymbol, currency: symbol.currency });
        barsWritten += result.written;
        barsRevised += result.revised;
      }
      succeeded++;
    } catch (error) { failures.push({ ticker: symbol.ticker, reason: error instanceof Error ? error.message : "invalid bars" }); }
  };
  if (options.mode === "daily") {
    const exchanges = [...new Set(symbols.map((symbol) => symbol.exchange))];
    for (const exchange of exchanges) {
      const group = symbols.filter((symbol) => symbol.exchange === exchange);
      try {
        // No symbols filter: one 100-call request per exchange, regardless of universe size.
        const rows = await client.eodBulkLastDay(exchange, { filter: "extended" });
        if (!Array.isArray(rows) || rows.length === 0) throw new Error(`empty EODHD bulk response for ${exchange}`);
        const byCode = new Map<string, BulkLastDayBar>();
        for (const row of rows) {
          if (byCode.has(row.code)) throw new Error(`duplicate EODHD bulk code ${row.code}`);
          byCode.set(row.code, row);
        }
        for (const symbol of group) {
          const row = byCode.get(symbol.code);
          if (!row) failures.push({ ticker: symbol.ticker, reason: `missing from ${exchange} bulk response` });
          else await save(symbol, [row]);
        }
      } catch (error) { for (const symbol of group) failures.push({ ticker: symbol.ticker, reason: error instanceof Error ? error.message : "bulk request failed" }); }
    }
  } else {
    for (const symbol of symbols) {
      try { await save(symbol, await client.eod(symbol.vendorSymbol, { period: "d", order: "a" })); }
      catch (error) { failures.push({ ticker: symbol.ticker, reason: error instanceof Error ? error.message : "history request failed" }); }
    }
  }
  const run: PriceRunRecord = { provider: "eodhd", startedAt, requested: symbols.length, succeeded, failed: failures.length, barsWritten, barsRevised, failures, stoppedReason: null };
  if (!options.dryRun) await repository.recordRun(run);
  return { ...run, callCost: Object.values(client.getCallCosts()).reduce((sum, cost) => sum + cost, 0), insufficientHistory };
}

export interface EodhdPriceArgs { mode: PriceMode; dryRun: boolean; fixture: boolean; only?: string[] }
export function parseEodhdPriceArgs(args: string[]): EodhdPriceArgs {
  const out: EodhdPriceArgs = { mode: "daily", dryRun: false, fixture: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--fixture") out.fixture = true;
    else if (args[i] === "--mode") {
      const mode = args[++i];
      if (mode !== "daily" && mode !== "backfill") throw new Error("--mode must be daily or backfill");
      out.mode = mode;
    } else if (args[i] === "--only") {
      out.only = args[++i]?.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
      if (!out.only?.length) throw new Error("--only needs a ticker list");
    } else throw new Error("Usage: npm run prices:eodhd -- [--mode daily|backfill] [--only TICKER,...] [--dry-run] [--fixture]");
  }
  if (out.fixture && !out.dryRun) throw new Error("--fixture requires --dry-run");
  if (out.fixture && out.only?.some((ticker) => ticker !== "MSFT")) throw new Error("--fixture contains only MSFT");
  return out;
}

async function main() {
  const args = parseEodhdPriceArgs(process.argv.slice(2));
  if (args.fixture) {
    const folder = join(process.cwd(), "src/data-providers/eodhd/fixtures");
    const bulk = JSON.parse(readFileSync(join(folder, "bulk-eod.json"), "utf8")) as BulkLastDayBar[];
    const history = JSON.parse(readFileSync(join(folder, "eod.json"), "utf8")) as EodBar[];
    const fixtureClient: EodhdPricesClient = { eod: async () => history, eodBulkLastDay: async () => bulk, getCallCosts: () => ({ "exchanges-list": 0, "exchange-symbol-list": 0, eod: 0, "eod-bulk-last-day": 0, fundamentals: 0, "calendar/earnings": 0, news: 0, "sec-filings/form4": 0 }) };
    const result = await runEodhdPrices(fixtureClient, new MemoryPriceRepository(), [{ ticker: "MSFT", vendorSymbol: "MSFT.US", exchange: "US", code: "MSFT", currency: "USD" }], args);
    process.stdout.write(`${JSON.stringify({ mode: args.mode, ...result, fixture: true, dryRun: true })}\n`);
    if (result.failed) process.exitCode = 1;
    return { requested: result.requested, succeeded: result.succeeded, failures: result.failed, callCost: 0 };
  }
  if (!process.env.DATABASE_URL || !process.env.EODHD_API_KEY) throw new Error("DATABASE_URL and EODHD_API_KEY are required; no request was made");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const universe = [...new Set([...(await loadUniverse(db, undefined, { collect: true })).map((item) => item.symbol), "SPY"])];
    const unknown = args.only?.filter((ticker) => !universe.includes(ticker)) ?? [];
    if (unknown.length) throw new Error(`Unknown ticker(s): ${unknown.join(", ")}`);
    const { symbols, unmapped } = await loadEodhdPriceSymbols(db, args.only ?? universe);
    if (unmapped.length) throw new Error(`Unmapped or ambiguous EODHD symbols: ${unmapped.join(", ")}`);
    const result = await runEodhdPrices(new EodhdClient(), new PostgresPriceRepository(db), symbols, args);
    process.stdout.write(`${JSON.stringify({ mode: args.mode, requested: result.requested, succeeded: result.succeeded, failed: result.failed, barsWritten: result.barsWritten, barsRevised: result.barsRevised, insufficientHistory: result.insufficientHistory, estimatedCalls: result.callCost, dryRun: args.dryRun })}\n`);
    for (const failure of result.failures) process.stderr.write(`Failed ${failure.ticker}: ${failure.reason}\n`);
    if (result.failed) process.exitCode = 1;
    return { requested: result.requested, succeeded: result.succeeded, failures: result.failed, estimatedCalls: result.callCost };
  } finally { await db.end(); }
}

if (/(?:^|[/\\])eodhd-prices\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const dryRun = process.argv.includes("--dry-run");
  void runLoggedJob("eodhd-prices", main, dryRun ? { store: null } : {});
}
