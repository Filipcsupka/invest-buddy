import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OHLCV } from "../engine";
import type { PriceRepository, PriceRunRecord } from "../db/prices";
import { MemoryPriceRepository, PostgresPriceRepository } from "../db/prices";
import { loadUniverse } from "../db/universe";
import { loadVendorSymbols } from "../data/security-master";
import { insertCorporateActions } from "../db/corporate-actions";
import type { CorporateAction } from "../data/corporate-actions";
import { EodhdClient, type BulkLastDayBar, type BulkSplit, type EodBar, type Split } from "../data-providers/eodhd/client";
import { runLoggedJob } from "./job-log";

export interface PriceSymbol { ticker: string; vendorSymbol: string; exchange: string; code: string; currency: string }
type EodhdPricesClient = Pick<EodhdClient, "eod" | "splits" | "getCallCosts"> & {
  eodBulkLastDay(exchange: string, options: { filter: "extended" }): Promise<BulkLastDayBar[]>;
  eodBulkLastDay(exchange: string, options: { type: "splits"; date?: string }): Promise<BulkSplit[]>;
};
export type PriceMode = "daily" | "backfill";
export interface EodhdPriceOptions { mode: PriceMode; dryRun?: boolean; now?: () => Date; unmapped?: string[]; recordActions?: (actions: CorporateAction[]) => Promise<void> }
export interface EodhdPriceResult extends PriceRunRecord { callCost: number; insufficientHistory: string[] }

/** EODHD's adjusted_close includes dividends and must not be used for price history. */
export function rawBar(row: EodBar, volumeFactor = 1): OHLCV {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`))) throw new Error("invalid bar date");
  const prices = [row.open, row.high, row.low, row.close];
  if (prices.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0) || typeof row.volume !== "number" || !Number.isFinite(row.volume) || row.volume < 0 || !Number.isFinite(volumeFactor) || volumeFactor <= 0) throw new Error(`invalid or incomplete raw bar ${row.date}`);
  const [open, high, low, close] = prices as number[];
  const bar = { date: row.date, open, high, low, close, volume: row.volume / volumeFactor };
  if (bar.high < bar.low || bar.open < bar.low - 1e-8 || bar.open > bar.high + 1e-8 || bar.close < bar.low - 1e-8 || bar.close > bar.high + 1e-8) throw new Error(`invalid raw OHLC ${row.date}`);
  return bar;
}

export function splitActions(ticker: string, rows: Split[]): CorporateAction[] {
  if (!Array.isArray(rows)) throw new Error("invalid EODHD splits response");
  return rows.map((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`))) throw new Error("invalid split date");
    const match = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(row.split);
    const ratio = match ? Number(match[1]) / Number(match[2]) : NaN;
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`invalid split ratio ${row.date}`);
    return { ticker, actionDate: row.date, kind: ratio >= 1 ? "split" : "reverse_split", ratio, amount: null,
      sourceId: "eodhd", detectedBy: "vendor", detail: { rule: "eodhd_splits", rawRatio: row.split } };
  });
}

export function barsFromHistory(rows: EodBar[], actions: CorporateAction[] = []): OHLCV[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty EODHD history");
  // EODHD reports volume adjusted for subsequent splits. Undo that adjustment
  // so each bar retains traded volume alongside its as-traded OHLC prices.
  const bars = rows.map((row) => rawBar(row, actions.filter((action) => action.actionDate > row.date).reduce((factor, action) => factor * action.ratio!, 1))).sort((a, b) => a.date.localeCompare(b.date));
  if (bars.some((bar, i) => i > 0 && bar.date === bars[i - 1].date)) throw new Error("duplicate EODHD bar date");
  return bars;
}

/** Resolve the home listing from an explicit mapping or the current exchange hint. */
export async function loadEodhdPriceSymbols(db: pg.Pool, tickers: string[]): Promise<{ symbols: PriceSymbol[]; unmapped: string[] }> {
  const explicit = await loadVendorSymbols(db, "eodhd");
  const hints = await db.query<{ ticker: string; exchange: string | null }>("SELECT ticker,exchange FROM instrument_ids WHERE valid_to IS NULL AND ticker = ANY($1::text[])", [tickers]);
  const exchangeHints = new Map(hints.rows.map((row) => [row.ticker, row.exchange]));
  const wanted = [...tickers, ...tickers.map((ticker) => explicit[ticker]).filter((value): value is string => Boolean(value))];
  const rows = await db.query<{ vendor_symbol: string; code: string; exchange: string; currency: string | null }>(
    "SELECT vendor_symbol,code,exchange,currency FROM symbols WHERE delisted=false AND (code = ANY($1::text[]) OR vendor_symbol = ANY($2::text[]))", [tickers, wanted]);
  const symbols: PriceSymbol[] = [], unmapped: string[] = [];
  for (const ticker of tickers) {
    const candidates = rows.rows.filter((row) => explicit[ticker] ? row.vendor_symbol === explicit[ticker] : row.vendor_symbol === ticker || row.code === ticker);
    const exact = candidates.find((row) => row.vendor_symbol === ticker);
    const hint = exchangeHints.get(ticker)?.toUpperCase();
    const preferred = hint && ["NASDAQ", "NYSE", "AMEX", "BATS", "NYSEARCA", "NYSE ARCA"].includes(hint) ? "US" : hint === "XETR" ? "XETRA" : hint;
    const matching = preferred ? candidates.filter((row) => row.exchange === preferred) : candidates.filter((row) => row.exchange === "US");
    const row = explicit[ticker] ? candidates.length === 1 ? candidates[0] : undefined
      : exact ?? (
        matching.length === 1 ? matching[0] : !preferred && candidates.length === 1 ? candidates[0] : undefined);
    if (!row?.currency) { unmapped.push(ticker); continue; }
    symbols.push({ ticker, vendorSymbol: row.vendor_symbol, exchange: row.exchange, code: row.code, currency: row.currency! });
  }
  return { symbols, unmapped };
}

export async function runEodhdPrices(client: EodhdPricesClient, repository: PriceRepository, symbols: PriceSymbol[], options: EodhdPriceOptions): Promise<EodhdPriceResult> {
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const failures: PriceRunRecord["failures"] = (options.unmapped ?? []).map((ticker) => ({ ticker, reason: "unresolved EODHD symbol or currency" }));
  const insufficientHistory: string[] = [];
  let succeeded = 0, barsWritten = 0, barsRevised = 0;
  const save = async (symbol: PriceSymbol, rows: EodBar[], splits: Split[]) => {
    try {
      const actions = splitActions(symbol.ticker, splits);
      const bars = barsFromHistory(rows, actions);
      if (options.mode === "backfill") {
        const stored = await repository.countSince(symbol.ticker, bars[0].date);
        if (stored > bars.length) throw new Error(`fetched ${bars.length} bars but ${stored} are stored for the same range; kept stored bars`);
        if (bars.length < 200) insufficientHistory.push(symbol.ticker);
      }
      if (!options.dryRun) {
        await options.recordActions?.(actions);
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
      if (group.length < 100) {
        for (const symbol of group) {
          try {
            const from = new Date(Date.parse(startedAt) - 14 * 86_400_000).toISOString().slice(0, 10);
            const rows = await client.eod(symbol.vendorSymbol, { period: "d", order: "d", from });
            const day = rows[0]?.date;
            if (!day) throw new Error("empty EODHD daily response");
            await save(symbol, [rows[0]], await client.splits(symbol.vendorSymbol, { from: day, to: day }));
          } catch (error) { failures.push({ ticker: symbol.ticker, reason: error instanceof Error ? error.message : "daily request failed" }); }
        }
        continue;
      }
      try {
        const rows = await client.eodBulkLastDay(exchange, { filter: "extended" });
        if (!Array.isArray(rows) || rows.length === 0) throw new Error(`empty EODHD bulk response for ${exchange}`);
        const splitRows = await client.eodBulkLastDay(exchange, { type: "splits", date: rows[0].date });
        if (!Array.isArray(splitRows)) throw new Error(`invalid EODHD bulk splits response for ${exchange}`);
        const byCode = new Map<string, BulkLastDayBar>();
        for (const row of rows) {
          if (byCode.has(row.code)) throw new Error(`duplicate EODHD bulk code ${row.code}`);
          byCode.set(row.code, row);
        }
        for (const symbol of group) {
          const row = byCode.get(symbol.code);
          if (!row) failures.push({ ticker: symbol.ticker, reason: `missing from ${exchange} bulk response` });
          else await save(symbol, [row], splitRows.filter((split) => split.code === symbol.code && split.exchange === exchange && split.date === row.date));
        }
      } catch (error) { for (const symbol of group) failures.push({ ticker: symbol.ticker, reason: error instanceof Error ? error.message : "bulk request failed" }); }
    }
  } else {
    for (const symbol of symbols) {
      try { await save(symbol, await client.eod(symbol.vendorSymbol, { period: "d", order: "a" }), await client.splits(symbol.vendorSymbol)); }
      catch (error) { failures.push({ ticker: symbol.ticker, reason: error instanceof Error ? error.message : "history request failed" }); }
    }
  }
  const run: PriceRunRecord = { provider: "eodhd", startedAt, requested: symbols.length + (options.unmapped?.length ?? 0), succeeded, failed: failures.length, barsWritten, barsRevised, failures, stoppedReason: null };
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
    const fixtureBulk = (async (_exchange: string, options: { filter: "extended" } | { type: "splits" }) => "type" in options ? [] : bulk) as EodhdPricesClient["eodBulkLastDay"];
    const fixtureClient: EodhdPricesClient = { eod: async () => history, splits: async () => [], eodBulkLastDay: fixtureBulk, getCallCosts: () => ({ "exchanges-list": 0, "exchange-symbol-list": 0, eod: 0, splits: 0, "eod-bulk-last-day": 0, fundamentals: 0, "calendar/earnings": 0, news: 0, "sec-filings/form4": 0 }) };
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
    const result = await runEodhdPrices(new EodhdClient(), new PostgresPriceRepository(db), symbols, { ...args, unmapped, recordActions: (actions) => insertCorporateActions(db, actions).then(() => undefined) });
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
