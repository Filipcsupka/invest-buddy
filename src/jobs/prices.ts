import { runLoggedJob } from "./job-log";
import pg from "pg";
import universe from "../../scanner/universe.json";
import type { MarketDataProvider } from "../data/providers";
import { DEFAULT_SYMBOL_MAP, DailyLimitError, SymbolNotFoundError, TwelveDataProvider } from "../data/twelvedata";
import { MemoryPriceRepository, PostgresPriceRepository, type PriceRepository, type PriceRunRecord } from "../db/prices";
import { loadUniverse } from "../db/universe";
import { loadVendorSymbols } from "../data/security-master";
import { CapReached, PostgresUsageLedger } from "../data/usage";
import { randomUUID } from "node:crypto";

export const BENCHMARK = "SPY";
export const FAILURE_LIMIT = 0.1;

export function priceTickers(instruments: { symbol: string }[] = universe.instruments): string[] {
  return [...new Set([...instruments.map((item) => item.symbol), BENCHMARK])];
}

export interface PriceRunOptions { dryRun?: boolean; provider?: string; now?: () => Date }
export interface PriceRunResult extends PriceRunRecord { exitCode: number; unmapped: string[] }

export async function runPrices(provider: MarketDataProvider, repository: PriceRepository, tickers: string[], options: PriceRunOptions = {}): Promise<PriceRunResult> {
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const failures: { ticker: string; reason: string }[] = [];
  const unmapped: string[] = [];
  let succeeded = 0, barsWritten = 0;
  let stoppedReason: string | null = null;
  for (const [index, ticker] of tickers.entries()) {
    try {
      const bars = await provider.bars(ticker);
      if (!bars.length) throw new Error("no bars returned");
      const stored = await repository.countSince(ticker, bars[0].date);
      if (bars.length < stored) throw new Error(`fetched ${bars.length} bars but ${stored} are stored for the same range; kept stored bars`);
      if (!options.dryRun) barsWritten += await repository.upsertBars(ticker, bars, { sourceId: options.provider ?? "twelvedata", vendorSymbol: DEFAULT_SYMBOL_MAP[ticker] ?? ticker });
      succeeded++;
    } catch (error) {
      if (error instanceof DailyLimitError || error instanceof CapReached) {
        stoppedReason = error.message;
        for (const rest of tickers.slice(index)) failures.push({ ticker: rest, reason: rest === ticker ? error.message : "not fetched: daily limit reached" });
        break;
      }
      if (error instanceof SymbolNotFoundError) unmapped.push(ticker);
      failures.push({ ticker, reason: error instanceof Error ? error.message : "unknown error" });
    }
  }
  const run: PriceRunRecord = { provider: options.provider ?? "twelvedata", startedAt, requested: tickers.length, succeeded, failed: failures.length, barsWritten, failures, stoppedReason };
  if (!options.dryRun) await repository.recordRun(run);
  const exitCode = tickers.length > 0 && failures.length / tickers.length > FAILURE_LIMIT ? 1 : 0;
  return { ...run, exitCode, unmapped };
}

async function main() {
  const args = process.argv.slice(2);
  const memory = args.includes("--memory"), dryRun = args.includes("--dry-run");
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1]?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
  if (onlyIndex >= 0 && !only?.length) throw new Error("--only requires a comma separated ticker list");
  if (args.some((arg, i) => arg !== "--memory" && arg !== "--dry-run" && arg !== "--only" && i !== onlyIndex + 1)) throw new Error("Usage: node dist/jobs/prices.js [--only T1,T2] [--memory] [--dry-run]");
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY is required; no request was made");
  const url = process.env.DATABASE_URL;
  if (!memory && !url) throw new Error("DATABASE_URL is required; use --memory for a run without a database");
  const pool = memory ? null : new pg.Pool({ connectionString: url });
  try {
    const all = priceTickers(pool ? await loadUniverse(pool) : universe.instruments);
    const unknown = (only ?? []).filter((t) => !all.includes(t));
    if (unknown.length) throw new Error(`Unknown ticker(s): ${unknown.join(", ")}`);
    const tickers = only ?? all;
    const repository = pool ? new PostgresPriceRepository(pool) : new MemoryPriceRepository();
    const runId = randomUUID();
    const ledger = pool ? new PostgresUsageLedger(pool) : null;
    const reserve = ledger ? () => ledger.reserve("twelvedata", 1, { job: "prices", runId, credits: 1 }) : undefined;
    const result = await runPrices(new TwelveDataProvider({ apiKey, reserve, ...(pool ? { symbolMap: await loadVendorSymbols(pool, "twelvedata") } : {}) }), repository, tickers, { dryRun });
    process.stdout.write(`Prices: ${result.succeeded}/${result.requested} tickers, ${result.barsWritten} bars written${dryRun ? " (dry run, nothing stored)" : ""}\n`);
    if (result.unmapped.length) process.stderr.write(`Unmapped symbols: ${result.unmapped.join(", ")}\n`);
    for (const failure of result.failures) process.stderr.write(`Failed ${failure.ticker}\n`);
    if (result.stoppedReason) process.stderr.write("Stopped: source limit reached\n");
    process.exitCode = result.exitCode;
    return { requested: result.requested, succeeded: result.succeeded, failures: result.failed, barsWritten: result.barsWritten };
  } finally { await pool?.end(); }
}

if (/(?:^|[/\\])prices\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("prices", main);
