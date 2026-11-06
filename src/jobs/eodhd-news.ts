import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import { CallBudget, callsLoggedToday, list, positiveInt, shiftDay, totalCalls } from "../db/economy-vendor";
import {
  cryptoSymbols, markSentimentFetched, parseNews, parseSentiments, pruneNews, sentimentQueue, upsertNews, upsertSentiment,
} from "../db/news";
import { loadUniverse } from "../db/universe";
import { loadEodhdPriceSymbols } from "./eodhd-prices";
import { runLoggedJob } from "./job-log";

export const NEWS_JOB = "eodhd-news";
export const SENTIMENT_JOB = "eodhd-sentiment";
const NEWS_COST = 5;
/** A two-symbol /sentiments request advanced the account counter by 10 on 2026-11-06. */
const SENTIMENT_COST_PER_SYMBOL = 5;
const NEWS_LIMIT = 100;
const SENTIMENT_FIRST_DAYS = 30;
const SENTIMENT_OVERLAP_DAYS = 3;

export interface NewsArgs {
  mode: "news" | "sentiment"; dryRun: boolean; maxCalls?: number; tags: string[]; general: boolean; symbols: string[]; universe: boolean;
  batch: number; daysBack: number; retentionDays: number;
}

export function parseNewsArgs(args: string[]): NewsArgs {
  const out: NewsArgs = { mode: "news", dryRun: false, tags: ["earnings"], general: true, symbols: [], universe: true, batch: 10, daysBack: 2, retentionDays: 120 };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--dry-run") out.dryRun = true;
    else if (flag === "--mode") { const value = args[++i]; if (value !== "news" && value !== "sentiment") throw new Error("--mode needs news|sentiment"); out.mode = value; }
    else if (flag === "--max-calls") out.maxCalls = positiveInt(flag, args[++i]);
    else if (flag === "--tags") out.tags = list(args[++i]).map((tag) => tag.toLowerCase());
    else if (flag === "--no-general") out.general = false;
    else if (flag === "--symbols") out.symbols = list(args[++i]).map((symbol) => symbol.toUpperCase());
    else if (flag === "--no-universe") out.universe = false;
    else if (flag === "--batch") out.batch = positiveInt(flag, args[++i], 50);
    else if (flag === "--days-back") out.daysBack = positiveInt(flag, args[++i], 30);
    else if (flag === "--retention-days") out.retentionDays = positiveInt(flag, args[++i], 3650);
    else throw new Error(`Unknown news option ${flag}`);
  }
  if (out.symbols.some((symbol) => !/^[A-Z0-9][A-Z0-9.-]{0,30}\.[A-Z]{1,6}$/.test(symbol))) throw new Error("--symbols needs EODHD symbols such as AAPL.US");
  return out;
}

export type NewsClient = Pick<EodhdClient, "news" | "sentiments" | "getCallCosts">;
const reason = (error: unknown) => error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "error";
const fatal = (error: unknown) => error instanceof EodhdHttpError && [401, 402, 403].includes(error.status);

/** The general feed, each tag and each extra symbol, one request apiece over the last `daysBack` days. Old headlines are pruned. */
export async function runNews(db: Pick<pg.Pool, "query"> | null, api: NewsClient | null, options: NewsArgs, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const plan = [...(options.general ? [{}] : []), ...options.tags.map((tag) => ({ tag })), ...options.symbols.map((symbol) => ({ symbol }))];
  const counts = { requests: 0, fetched: 0, written: 0, pruned: 0, skippedRows: 0, failedRequests: 0, capped: false as boolean };
  if (!options.dryRun && (!api || !db)) throw new Error("A live news run needs DATABASE_URL and EODHD_API_KEY");
  if (options.dryRun || !api || !db) return { ...counts, dryRun: true, plannedRequests: plan.length, estimatedCalls: plan.length * NEWS_COST, failures: 0, calls: 0 };
  const budget = new CallBudget(options.maxCalls ?? 100, await callsLoggedToday(db, NEWS_JOB));
  try {
    for (const request of plan) {
      if (!budget.allow(NEWS_COST)) break;
      counts.requests++;
      try {
        const parsed = parseNews(await api.news({ ...request, from: shiftDay(today, -options.daysBack), to: today, limit: NEWS_LIMIT }));
        counts.skippedRows += parsed.skipped;
        counts.fetched += parsed.rows.length;
        counts.written += await upsertNews(db, parsed.rows);
      } catch (error) {
        counts.failedRequests++;
        process.stderr.write(`${JSON.stringify({ event: "eodhd_news_request_failed", request: Object.values(request)[0] ?? "general", reason: reason(error) })}\n`);
        if (fatal(error)) break;
      }
    }
    counts.pruned = await pruneNews(db, options.retentionDays);
  } finally {
    const calls = totalCalls(api.getCallCosts());
    if (calls > 0) await logEodhdCalls(db, NEWS_JOB, calls);
  }
  counts.capped = budget.capped;
  return { ...counts, dryRun: false, plannedRequests: plan.length, estimatedCalls: plan.length * NEWS_COST, failures: counts.failedRequests + counts.skippedRows, calls: totalCalls(api.getCallCosts()) };
}

/** Crypto assets, the scored universe's EODHD listings and any --symbols, deduplicated. */
export async function sentimentCandidates(db: pg.Pool, options: NewsArgs, today: string): Promise<string[]> {
  const out = new Set<string>(options.symbols);
  for (const symbol of await cryptoSymbols(db)) out.add(symbol);
  if (options.universe) {
    const tickers = (await loadUniverse(db, today)).map((row) => row.symbol);
    if (tickers.length) for (const row of (await loadEodhdPriceSymbols(db, tickers)).symbols) out.add(row.vendorSymbol.toUpperCase());
  }
  return [...out];
}

/**
 * Daily vendor sentiment in batches of `batch` symbols. Symbols that waited longest go first, so a capped run continues where the last one
 * stopped. A first request reads 30 days; later ones re-read the last three days before the previous request.
 */
export async function runSentiment(db: Pick<pg.Pool, "query"> | null, api: NewsClient | null, options: NewsArgs, candidates: string[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const counts = { candidates: candidates.length, requests: 0, symbolsFetched: 0, written: 0, skippedRows: 0, failedRequests: 0, capped: false as boolean };
  if (!options.dryRun && (!api || !db)) throw new Error("A live sentiment run needs DATABASE_URL and EODHD_API_KEY");
  if (options.dryRun || !api || !db) return { ...counts, dryRun: true, estimatedCalls: candidates.length * SENTIMENT_COST_PER_SYMBOL, failures: 0, calls: 0 };
  const queue = await sentimentQueue(db, candidates);
  const budget = new CallBudget(options.maxCalls ?? 500, await callsLoggedToday(db, SENTIMENT_JOB));
  try {
    for (let i = 0; i < queue.length; i += options.batch) {
      const batch = queue.slice(i, i + options.batch);
      if (!budget.allow(batch.length * SENTIMENT_COST_PER_SYMBOL)) break;
      const from = batch.reduce((earliest, row) => {
        const start = row.lastFetched ? shiftDay(row.lastFetched, -SENTIMENT_OVERLAP_DAYS) : shiftDay(today, -SENTIMENT_FIRST_DAYS);
        return start < earliest ? start : earliest;
      }, today);
      counts.requests++;
      try {
        const parsed = parseSentiments(await api.sentiments(batch.map((row) => row.symbol), { from, to: today }));
        counts.skippedRows += parsed.skipped;
        counts.written += await upsertSentiment(db, parsed.rows);
        await markSentimentFetched(db, batch.map((row) => row.symbol));
        counts.symbolsFetched += batch.length;
      } catch (error) {
        counts.failedRequests++;
        process.stderr.write(`${JSON.stringify({ event: "eodhd_sentiment_request_failed", symbols: batch.length, reason: reason(error) })}\n`);
        if (fatal(error)) break;
      }
    }
  } finally {
    const calls = totalCalls(api.getCallCosts());
    if (calls > 0) await logEodhdCalls(db, SENTIMENT_JOB, calls);
  }
  counts.capped = budget.capped;
  return { ...counts, dryRun: false, estimatedCalls: candidates.length * SENTIMENT_COST_PER_SYMBOL, failures: counts.failedRequests + counts.skippedRows, calls: totalCalls(api.getCallCosts()) };
}

if (process.argv[1]?.endsWith("eodhd-news.ts") || process.argv[1]?.endsWith("eodhd-news.js")) {
  const options = parseNewsArgs(process.argv.slice(2));
  const db = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  void runLoggedJob(options.mode === "news" ? NEWS_JOB : SENTIMENT_JOB, async () => {
    try {
      const api = options.dryRun ? null : new EodhdClient();
      const result = options.mode === "news" ? await runNews(db, api, options)
        : await runSentiment(db, api, options, db ? await sentimentCandidates(db, options, new Date().toISOString().slice(0, 10)) : options.symbols);
      if (result.failedRequests) process.exitCode = 1;
      return result;
    } finally { await db?.end(); }
  }, options.dryRun ? { store: null } : {});
}
