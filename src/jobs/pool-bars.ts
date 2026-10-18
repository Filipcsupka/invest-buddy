import pg from "pg";
import { computeGrowth, fetchFrame, label, latestQuarter, REVENUE_CONCEPTS, shift, type FrameValue } from "../collectors/sources/frames";
import { defaultHttp } from "../collectors/sources/client";
import { loadTickers } from "../collectors/sources/sec";
import { DailyLimitError, SymbolNotFoundError, TwelveDataProvider } from "../data/twelvedata";
import { CapReached, PostgresUsageLedger } from "../data/usage";
import { NOT_FOUND_SYMBOLS, rankPool } from "../universe/pool";
import { DUPLICATE_FILERS } from "../universe/select";
import { saveDiscoveryPriceBars } from "./discovery";

/**
 * D35 step 2: private price history for the market-wide growth pool. Bars go to `discovery_price_bars` only, which no web page reads,
 * so pool names are never displayed. Each run fetches at most --limit names that have no fresh history, in pool rank order, and stops
 * on the first Twelve Data or ledger cap. Re-run daily until the pool is covered; a covered name costs nothing.
 */
export interface PoolBarsOptions { limit: number; size: number; minYoy: number }

export function parsePoolBarsArgs(args: string[]): PoolBarsOptions {
  const out: PoolBarsOptions = { limit: 250, size: 300, minYoy: 15 };
  for (let i = 0; i < args.length; i += 2) {
    const value = Number(args[i + 1]);
    if (!Number.isInteger(value) || value <= 0) throw new Error("Invalid pool-bars argument");
    if (args[i] === "--limit") out.limit = value;
    else if (args[i] === "--size") out.size = value;
    else if (args[i] === "--min-yoy") out.minYoy = value;
    else throw new Error("Unknown pool-bars option");
  }
  return out;
}

/** Names that need no request: Twelve Data does not know them, or they are a duplicate filer excluded from selection. */
export const skipsBars = (ticker: string) => NOT_FOUND_SYMBOLS.has(ticker) || ticker in DUPLICATE_FILERS;

/** A name is covered when it has at least 200 stored bars and the newest one is at most 5 days old. */
export function needsBars(bars: { count: number; newest: string | null }, today: string): boolean {
  if (bars.count < 200 || !bars.newest) return true;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${bars.newest}T00:00:00Z`) > 5 * 86400000;
}

async function main() {
  const options = parsePoolBarsArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL || !process.env.TWELVE_DATA_API_KEY) throw new Error("DATABASE_URL and TWELVE_DATA_API_KEY are required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const today = new Date().toISOString().slice(0, 10);
  try {
    const held = new Set((await pool.query<{ ticker: string }>("SELECT DISTINCT ticker FROM universe_membership WHERE valid_to IS NULL")).rows.map((r) => r.ticker));
    const http = defaultHttp(), quarter = latestQuarter(new Date());
    const byConcept = new Map<string, Map<string, Map<number, FrameValue>>>();
    for (const concept of REVENUE_CONCEPTS) {
      const frames = new Map<string, Map<number, FrameValue>>();
      for (const wanted of [quarter, shift(quarter, -1), shift(quarter, -4), shift(quarter, -5)]) frames.set(label(wanted), await fetchFrame({ http } as never, concept, wanted));
      byConcept.set(concept, frames);
    }
    const tickers = await loadTickers(http);
    const ranked = rankPool(computeGrowth(byConcept, quarter), new Map([...tickers.byCik].map(([cik, row]) => [cik, row.ticker])), held, { minYoy: options.minYoy, size: options.size });
    const stored = await pool.query<{ symbol: string; count: string; newest: string | null }>(
      "SELECT symbol, count(*)::text AS count, max(bar_date)::text AS newest FROM discovery_price_bars WHERE symbol = ANY($1) GROUP BY symbol", [ranked.map((r) => r.ticker)]);
    const have = new Map(stored.rows.map((r) => [r.symbol, { count: Number(r.count), newest: r.newest }]));
    const todo = ranked.filter((r) => !skipsBars(r.ticker) && needsBars(have.get(r.ticker) ?? { count: 0, newest: null }, today));
    const usage = new PostgresUsageLedger(pool);
    const provider = new TwelveDataProvider({ apiKey: process.env.TWELVE_DATA_API_KEY, reserve: () => usage.reserve("twelvedata", 1, { job: "pool-bars", credits: 1 }) });
    let fetched = 0, notFound = 0, stopped: string | null = null;
    for (const row of todo) {
      if (provider.requests >= options.limit) { stopped = "run limit"; break; }
      try {
        await saveDiscoveryPriceBars(pool, { symbol: row.ticker, name: row.name, sector: "Unclassified" }, await provider.bars(row.ticker));
        fetched++;
      } catch (error) {
        if (error instanceof SymbolNotFoundError) { notFound++; continue; }
        if (error instanceof DailyLimitError || error instanceof CapReached) { stopped = error instanceof Error ? error.message : "cap"; break; }
        process.stderr.write(`${row.ticker}: ${error instanceof Error ? error.message : "failed"}\n`);
      }
    }
    process.stdout.write(`${JSON.stringify({ job: "pool-bars", quarter: label(quarter), pool: ranked.length, skipped: ranked.filter((r) => skipsBars(r.ticker)).length, alreadyCovered: ranked.filter((r) => !skipsBars(r.ticker)).length - todo.length, fetched, notFound, requests: provider.requests, remaining: todo.length - fetched - notFound, stopped })}\n`);
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])pool-bars\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error); process.exitCode = 1; });
