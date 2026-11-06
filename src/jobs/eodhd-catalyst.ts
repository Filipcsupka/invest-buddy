import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { EodhdClient, EodhdHttpError, type NewsItem } from "../data-providers/eodhd/client";
import { document } from "../collectors/types";
import { PostgresCollectorRepository } from "../db/collectors";
import { loadUniverse } from "../db/universe";
import { CATALYST_EODHD_FACT_NAME } from "../data/catalyst";
import { daysBetween } from "../data/catalyst-calendar";
import { earningsCatalyst, newsCatalyst, newsStoryKey, type EodhdNewsEvidence } from "../data/eodhd-catalyst";
import type { EstimateObservation } from "../data/estimate-revisions";
import { loadEodhdPriceSymbols } from "./eodhd-prices";
import { runLoggedJob } from "./job-log";

const SOURCE = "eodhd";
const MAX_NEWS_SYMBOLS = 20;
/** One request per symbol, so a busy name cannot use up the article limit of the others. */
const NEWS_LIMIT_PER_SYMBOL = 25;
const NEWS_SCORE_MIN = 15;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface CatalystSubject { ticker: string; vendorSymbol: string; score: number | null }
export interface CalendarObservation extends EstimateObservation { ticker: string }
export interface CatalystClient { news(options: { symbol: string; from: string; to: string; limit: number }): Promise<NewsItem[]>; getCallCosts(): Record<string, number> }
export interface CatalystOptions { dryRun?: boolean; now?: Date; only?: string[]; maxNewsSymbols?: number; subjects?: CatalystSubject[]; calendarRows?: CalendarObservation[]; fixtureDir?: string }

/**
 * Only scored non-US home listings enter this collector; their latest score controls news spend.
 * The vendor symbol comes from the explicit EODHD mapping or the home-listing resolver the price job uses (US names resolve to .US and stay out).
 * A ticker the resolver cannot place is returned in `unresolved`, never guessed from its code.
 */
export async function loadCatalystSubjects(db: pg.Pool, asOf: string, only?: string[]): Promise<{ subjects: CatalystSubject[]; unresolved: string[] }> {
  const universe = (await loadUniverse(db, asOf)).map((row) => row.symbol).filter((ticker) => !only || only.includes(ticker));
  if (!universe.length) return { subjects: [], unresolved: [] };
  const { symbols, unmapped } = await loadEodhdPriceSymbols(db, universe);
  const scores = await db.query<{ ticker: string; total: number | null }>(`SELECT DISTINCT ON (ticker) ticker, total FROM score_results
    WHERE ticker=ANY($1::text[]) AND as_of <= $2::date ORDER BY ticker, as_of DESC`, [symbols.map((row) => row.ticker), asOf]);
  const score = new Map(scores.rows.map((row) => [row.ticker, row.total === null ? null : Number(row.total)]));
  const subjects = symbols.filter((row) => row.exchange !== "US" && !row.vendorSymbol.endsWith(".US"))
    .map((row) => ({ ticker: row.ticker, vendorSymbol: row.vendorSymbol, score: score.get(row.ticker) ?? null }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  return { subjects, unresolved: [...unmapped] };
}

export async function loadCatalystCalendar(db: Pick<pg.Pool, "query">, tickers: string[], asOf: string): Promise<CalendarObservation[]> {
  if (!tickers.length) return [];
  const result = await db.query<CalendarObservation>(`SELECT ticker, observed_on::text AS "observedOn", report_date::text AS "reportDate",
      fiscal_date_ending::text AS "fiscalDateEnding", estimate::float8 AS estimate, source_id AS "sourceId"
    FROM earnings_calendar_snapshots WHERE source_id='eodhd' AND ticker=ANY($1::text[])
      AND observed_on <= $2::date AND (observed_at AT TIME ZONE 'UTC')::date <= $2::date AND observed_on >= $2::date - 37
    ORDER BY ticker, observed_on, report_date`, [tickers, asOf]);
  return result.rows;
}

/** An article is stored per symbol because source_documents has one symbol per URL. The fragment keeps the publisher URL usable. */
function articleUrl(link: string, ticker: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== "https:") return null;
    url.hash = `eodhd-${encodeURIComponent(ticker)}`;
    return url.toString();
  } catch { return null; }
}

export async function runEodhdCatalyst(db: pg.Pool | null, api: CatalystClient, options: CatalystOptions = {}) {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const loaded = options.subjects ? { subjects: options.subjects, unresolved: [] as string[] }
    : db ? await loadCatalystSubjects(db, today, options.only) : { subjects: [], unresolved: [] as string[] };
  const subjects = loaded.subjects;
  const calendar = options.calendarRows ?? (db ? await loadCatalystCalendar(db, subjects.map((row) => row.ticker), today) : []);
  const byTicker = new Map<string, CalendarObservation[]>();
  for (const row of calendar) byTicker.set(row.ticker, [...(byTicker.get(row.ticker) ?? []), row]);
  const max = options.maxNewsSymbols ?? MAX_NEWS_SYMBOLS;
  const shortlisted = subjects.filter((row) => row.score !== null && row.score >= NEWS_SCORE_MIN)
    .sort((a, b) => b.score! - a.score! || a.ticker.localeCompare(b.ticker)).slice(0, max);
  const repo = db && !options.dryRun ? new PostgresCollectorRepository(db) : null;
  const newsByTicker = new Map<string, EodhdNewsEvidence[]>();
  let requests = 0, articles = 0, documents = 0, facts = 0;
  const failed: string[] = [...loaded.unresolved];
  for (const ticker of loaded.unresolved)
    process.stderr.write(`${JSON.stringify({ event: "eodhd_catalyst_symbol_unresolved", symbols: [ticker], reason: "no EODHD mapping or home listing" })}\n`);
  let stoppedEarly = false;
  const seen = new Map<string, Set<string>>();
  for (const row of shortlisted) {
    try {
      requests++;
      const news = await api.news({ symbol: row.vendorSymbol, from: shift(today, -7), to: today, limit: NEWS_LIMIT_PER_SYMBOL });
      for (const item of news) {
        if (!Array.isArray(item.symbols) || !Array.isArray(item.tags) || typeof item.title !== "string" || typeof item.link !== "string"
          || !item.link.startsWith("https://") || !Number.isFinite(Date.parse(item.date)) || !item.symbols.includes(row.vendorSymbol)) continue;
        const day = item.date.slice(0, 10);
        if (daysBetween(day, today) < 0 || daysBetween(day, today) > 7) continue;
        const polarity = typeof item.sentiment?.polarity === "number" ? item.sentiment.polarity : Number.NaN;
        const url = articleUrl(item.link, row.ticker);
        if (!url) continue;
        const keys = seen.get(row.ticker) ?? new Set<string>();
        seen.set(row.ticker, keys);
        const story = `story:${newsStoryKey(item.title, item.date)}`;
        if (keys.has(`url:${url}`) || keys.has(story)) continue;
        keys.add(`url:${url}`); keys.add(story);
        let documentId: number | undefined;
        if (repo) {
          const stored = await repo.upsertDocument(document({ source: SOURCE, sourceId: SOURCE, symbol: row.ticker,
            docType: "news", url, publishedAt: item.date, body: item.title,
            meta: { headline: item.title, sentiment: item.sentiment, tags: item.tags, vendorSymbol: row.vendorSymbol,
              canonicalUrl: item.link, display_allowed: false, fetchedAt: now.toISOString() } }));
          documentId = stored.id;
          if (stored.written) documents++;
        }
        newsByTicker.set(row.ticker, [...(newsByTicker.get(row.ticker) ?? []),
          { url: item.link, title: item.title, publishedAt: item.date, tags: item.tags, sentiment: polarity, documentId }]);
        articles++;
      }
    } catch (error) {
      failed.push(row.ticker);
      const reason = error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "error";
      process.stderr.write(`${JSON.stringify({ event: "eodhd_catalyst_news_failed", symbols: [row.ticker], reason })}\n`);
      if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) { stoppedEarly = true; break; }
    }
  }
  for (const row of subjects) {
    const fact = earningsCatalyst(row.ticker, byTicker.get(row.ticker) ?? [], today)
      ?? newsCatalyst(newsByTicker.get(row.ticker) ?? [], today);
    if (!fact) continue;
    facts++;
    if (repo) await repo.upsertFact({ symbol: row.ticker, key: CATALYST_EODHD_FACT_NAME, asOf: today, value: fact,
      documentIds: fact.documentIds, sourceId: SOURCE, expiresAt: shift(today, fact.kind === "earnings_revision" ? 15 : 8) });
  }
  return { subjects: subjects.length, shortlisted: shortlisted.length, newsRequests: requests, newsArticles: articles,
    documents, facts, failures: failed.length, failedSymbols: failed.join(","), stoppedEarly,
    baseCalls: api.getCallCosts().news ?? 0, possibleTickerSurcharge: shortlisted.length * 5 };
}

export function parseArgs(args: string[]): CatalystOptions {
  const out: CatalystOptions = { dryRun: false, maxNewsSymbols: MAX_NEWS_SYMBOLS };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--fixture-dir") out.fixtureDir = args[++i];
    else if (args[i] === "--only") out.only = (args[++i] ?? "").split(",").filter(Boolean);
    else if (args[i] === "--max-news-symbols") out.maxNewsSymbols = Number(args[++i]);
    else if (args[i] === "--as-of") {
      const day = args[++i];
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new Error("--as-of needs YYYY-MM-DD");
      out.now = new Date(`${day}T12:00:00Z`);
    } else throw new Error(`Unknown eodhd-catalyst option ${args[i]}`);
  }
  if (!Number.isInteger(out.maxNewsSymbols) || out.maxNewsSymbols! < 1 || out.maxNewsSymbols! > MAX_NEWS_SYMBOLS) throw new Error(`--max-news-symbols needs 1..${MAX_NEWS_SYMBOLS}`);
  if (out.now && !out.dryRun) throw new Error("--as-of is for dry-run only");
  if (out.fixtureDir && (!out.dryRun || !out.only?.length)) throw new Error("--fixture-dir needs --dry-run and --only");
  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = process.env.DATABASE_URL && !options.fixtureDir ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  if (!db && !options.fixtureDir) throw new Error("DATABASE_URL is required outside fixture dry-run");
  const api: CatalystClient = options.fixtureDir ? {
    news: () => readFile(join(options.fixtureDir!, "news.json"), "utf8").then((value) => JSON.parse(value) as NewsItem[]),
    getCallCosts: () => ({ news: 5 }),
  } : new EodhdClient();
  if (options.fixtureDir) {
    options.subjects = options.only!.map((vendorSymbol) => ({ ticker: vendorSymbol.split(".")[0], vendorSymbol, score: 16 }));
    options.calendarRows = JSON.parse(await readFile(join(options.fixtureDir, "calendar.json"), "utf8")) as CalendarObservation[];
  }
  try {
    const result = await runEodhdCatalyst(db, api, options);
    process.stdout.write(`eodhd-catalyst: ${JSON.stringify(result)}${options.dryRun ? " (dry run)" : ""}\n`);
    if (result.failures) process.exitCode = 1;
    return result;
  } finally { await db?.end(); }
}
if (/(?:^|[/\\])eodhd-catalyst\.(?:ts|js)$/.test(process.argv[1] ?? ""))
  void runLoggedJob("eodhd-catalyst", main, { store: process.argv.includes("--dry-run") ? null : undefined });
