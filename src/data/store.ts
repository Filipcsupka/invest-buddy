import { cache } from "react";
import { getPool } from "../db/pool";
import { extendedOn, pageScoreRow, scoreExtended, scoringMember } from "../db/universe";
import { CACHE_TAGS, webCached } from "./web-cache";
import { LISTING_BAR_LIMIT, listingAudit, trimmedAudit } from "./audit-sql";
import type { ScoreResult } from "../engine";
import type { Instrument } from "./providers";
import { scoredUniverse as fixtureUniverse } from "./scored";
import { fixtureRecord } from "./record";
import { instruments as fixtureInstruments } from "./fixtures";
import { samplePortfolio } from "../portfolio/fixture";
import { PostgresPortfolioRepository } from "../db/portfolio";
import { PostgresNavHistoryRepository } from "../db/portfolio-history";
import { buildIndexedSeries, type IndexedSeries } from "../portfolio/history";
import { score } from "../engine";
import { fixtureProvider } from "./fixtures";

export interface StoreRow { instrument: Instrument; result: ScoreResult }
export interface StoreData<T> { rows: T; sample: boolean; lastUpdated: string | null; stale: boolean }
/** Stale after 3 days. A Friday session is scored on Saturday and the next score comes Tuesday morning, so a Friday date gets until Tuesday 06:00 UTC (4.25 days). */
export const stale = (date: string | null, now = Date.now()) => {
  if (!date) return false;
  const day = Date.parse(`${date}T00:00:00Z`);
  const limit = new Date(day).getUTCDay() === 5 ? 4.25 * 86_400_000 : 3 * 86_400_000;
  return now - day > limit;
};
const fixtureMode = () => process.env.DATA_MODE === "fixture";
const pool = getPool;
/** No pool means the loader returns an empty result; do not cache it. */
const noPool = () => !pool();
const withoutBars = (rows: StoreRow[]): StoreRow[] => rows.map(({ instrument, result }) => ({ instrument, result: { ...result, inputs: { ...result.inputs, bars: [] } } }));
const lastBars = (rows: StoreRow[]): StoreRow[] => rows.map(({ instrument, result }) => ({ instrument, result: { ...result, inputs: { ...result.inputs, bars: (result.inputs?.bars ?? []).slice(-LISTING_BAR_LIMIT) } } }));
/**
 * Latest page row per current member for listing pages (scanner, heatmap, footer, sitemap, OG image, allocation).
 * Reads the generated `listing_audit` (migration 137): rules and evidence plus the last LISTING_BAR_LIMIT bars, never the full audit.
 */
async function latestScoresUncached(): Promise<StoreData<StoreRow[]>> {
  if (fixtureMode()) { const rows = lastBars(await fixtureUniverse()); return { rows, sample: true, lastUpdated: rows[0]?.result.asOf ?? null, stale: false }; }
  const db = pool(); if (!db) return { rows: [], sample: false, lastUpdated: null, stale: false };
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; list: string; audit: ScoreResult; as_of: string }>(`SELECT l.ticker,l.name,l.sector,l.tier,l.source,l.list,${listingAudit("r")} AS audit,l.as_of::text FROM (SELECT DISTINCT ON (s.ticker) s.ticker,i.name,i.sector,m.tier,i.source,m.list,s.as_of FROM score_results s
    JOIN instruments i ON i.ticker=s.ticker JOIN universe_membership m ON m.ticker=i.ticker
    WHERE ${pageScoreRow()} AND ${scoringMember()} AND m.valid_from <= CURRENT_DATE
      AND s.as_of >= m.valid_from
      AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE) ORDER BY s.ticker,s.as_of DESC) l
    JOIN score_results r ON r.ticker=l.ticker AND r.as_of=l.as_of ORDER BY l.ticker`);
  const rows = result.rows.map((row) => ({ instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source, list: row.list }, result: row.audit }));
  const lastUpdated = result.rows.map((row) => row.as_of).sort().at(-1) ?? null;
  return { rows, sample: false, lastUpdated, stale: stale(lastUpdated) };
}
/** Current, viewable membership for one ticker. Safe to reuse across public requests. */
async function instrumentForTickerUncached(ticker: string): Promise<Instrument | null> {
  const symbol = ticker.toUpperCase();
  if (fixtureMode()) return fixtureInstruments.find((item) => item.ticker === symbol) ?? null;
  const db = pool(); if (!db) return null;
  const result = await db.query<Instrument>(`SELECT i.ticker,i.name,i.sector,m.tier,i.source,m.list FROM universe_membership m
    JOIN instruments i ON i.ticker=m.ticker WHERE i.ticker=$1 AND ${scoringMember()} AND m.valid_from <= CURRENT_DATE
    AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE) LIMIT 1`, [symbol]);
  return result.rows[0] ?? null;
}
/** One full audit, with chart bars, for the selected company only. */
async function scoreForTickerUncached(ticker: string): Promise<StoreData<StoreRow | null>> {
  const symbol = ticker.toUpperCase();
  if (fixtureMode()) {
    const instrument = fixtureInstruments.find((item) => item.ticker === symbol);
    const row = instrument ? { instrument, result: score({ ticker: symbol, bars: await fixtureProvider.bars(symbol), fundamentals: await fixtureProvider.fundamentals(symbol), macro: await fixtureProvider.macro(symbol) }) } : null;
    return { rows: row, sample: true, lastUpdated: row?.result.asOf ?? null, stale: false };
  }
  const db = pool(); if (!db) return { rows: null, sample: false, lastUpdated: null, stale: false };
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; list: string; audit: ScoreResult; as_of: string }>(`SELECT s.ticker,i.name,i.sector,m.tier,i.source,m.list,${trimmedAudit("s.audit")} AS audit,s.as_of::text FROM score_results s
    JOIN instruments i ON i.ticker=s.ticker JOIN universe_membership m ON m.ticker=i.ticker
    WHERE s.ticker=$1 AND ${pageScoreRow()} AND ${scoringMember()} AND m.valid_from <= CURRENT_DATE
      AND s.as_of >= m.valid_from AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE)
    ORDER BY s.as_of DESC LIMIT 1`, [symbol]);
  const row = result.rows[0];
  const lastUpdated = row?.as_of ?? null;
  return { rows: row ? { instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source, list: row.list }, result: row.audit } : null, sample: false, lastUpdated, stale: stale(lastUpdated) };
}
/** Ticker universe: fixture instruments in fixture mode, otherwise current membership. */
async function instrumentUniverseUncached(): Promise<Instrument[]> {
  if (fixtureMode()) return fixtureInstruments;
  const db = pool(); if (!db) return [];
  const result = await db.query<Instrument>(`SELECT i.ticker,i.name,i.sector,m.tier,i.source,m.list FROM universe_membership m
    JOIN instruments i ON i.ticker=m.ticker WHERE ${scoringMember()} AND m.valid_from <= CURRENT_DATE
    AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE) ORDER BY i.ticker`);
  return result.rows;
}
async function scoreHistoryUncached(): Promise<StoreData<StoreRow[]>> {
  if (fixtureMode()) { const rows = fixtureRecord(); return { rows, sample: true, lastUpdated: rows[0]?.result.asOf ?? null, stale: false }; }
  const db = pool(); if (!db) return { rows: [], sample: false, lastUpdated: null, stale: false };
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; audit: ScoreResult; as_of: string }>(`SELECT s.ticker,i.name,i.sector,i.tier,i.source,${listingAudit("s", 0)} AS audit,s.as_of::text FROM score_results s JOIN instruments i ON i.ticker=s.ticker WHERE ${pageScoreRow()}${scoreExtended() ? "" : ` AND NOT ${extendedOn("s.ticker", "s.as_of")}`} ORDER BY s.as_of DESC,s.ticker`);
  const rows = result.rows.map((row) => ({ instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source }, result: row.audit }));
  const lastUpdated = result.rows[0]?.as_of ?? null;
  return { rows, sample: false, lastUpdated, stale: stale(lastUpdated) };
}
async function latestPortfolioUncached() {
  if (fixtureMode()) return samplePortfolio;
  const db = pool(); if (!db) return null;
  const snapshot = await new PostgresPortfolioRepository(db).latestPublished(new Date().toISOString().slice(0, 10));
  return snapshot?.sample ? null : snapshot;
}

/** Indexed portfolio and real SPY series from the private NAV history. Null in fixture mode. Raw EUR amounts never leave this function. */
export async function portfolioIndexedSeries(): Promise<IndexedSeries | null> {
  if (fixtureMode()) return null;
  const db = pool(); if (!db) return { points: [], twrPercent: null, benchmarkPercent: null };
  const history = await new PostgresNavHistoryRepository(db).all();
  const bars = await db.query<{ date: string; close: string }>("SELECT bar_date::text AS date, close FROM daily_bars WHERE ticker='SPY' ORDER BY bar_date");
  return buildIndexedSeries(history, bars.rows.map((row) => ({ date: row.date, close: Number(row.close) })));
}

export async function alertHistory() {
  if (fixtureMode()) return [];
  const db = pool(); if (!db) return [];
  const result = await db.query<{ ticker: string; as_of: string; previous_state: ScoreResult["state"] | null; current_state: ScoreResult["state"]; previous_score: number | null; current_score: number }>(`SELECT a.ticker,a.as_of::text,a.previous_state,a.current_state,a.previous_score,a.current_score
      FROM alerts a JOIN score_results s ON s.ticker=a.ticker AND s.as_of=a.as_of WHERE ${pageScoreRow()} ORDER BY a.as_of DESC,a.ticker`);
  return result.rows.map((row) => ({ ticker: row.ticker, asOf: row.as_of, previousState: row.previous_state, currentState: row.current_state, previousScore: row.previous_score, currentScore: row.current_score }));
}

/** Per-request memo (React cache): generateMetadata and the page share one query. */
export const latestScores = cache(webCached(latestScoresUncached, "latest-scores", [CACHE_TAGS.scores], { bypass: noPool }));
/** Same cached read as `latestScores`, without bars: for rows that cross a client boundary (dashboard). One query serves both. */
export const latestScoreSummaries = cache(async (): Promise<StoreData<StoreRow[]>> => { const data = await latestScores(); return { ...data, rows: withoutBars(data.rows) }; });
export const instrumentForTicker = cache(webCached(instrumentForTickerUncached, "instrument-for-ticker", [CACHE_TAGS.scores], { bypass: noPool }));
export const scoreForTicker = cache(webCached(scoreForTickerUncached, "score-for-ticker", [CACHE_TAGS.scores], { bypass: noPool }));
export const instrumentUniverse = cache(webCached(instrumentUniverseUncached, "instrument-universe", [CACHE_TAGS.scores], { bypass: noPool }));
/** Every stored page row, without bars (track record). Cached: about 2,200 rows that change once a day. */
export const scoreHistory = cache(webCached(scoreHistoryUncached, "score-history", [CACHE_TAGS.scores], { bypass: noPool }));
export const latestPortfolio = cache(webCached(latestPortfolioUncached, "latest-portfolio", [CACHE_TAGS.portfolio], { bypass: noPool }));

/**
 * Fills the hot listing caches at server start (instrumentation). Fire and forget: never throws, never blocks readiness.
 * Per-ticker reads (company page, dataset freshness) fill on first visit; warming 500 of them would delay the listing reads.
 */
export async function warmWebCaches(): Promise<void> {
  if (fixtureMode() || noPool()) return;
  const started = Date.now();
  const results = await Promise.allSettled([latestScores(), instrumentUniverse(), latestPortfolio()]);
  const failed = results.filter((result) => result.status === "rejected").length;
  console.log(JSON.stringify({ event: "web_cache_warm", durationMs: Date.now() - started, failed }));
}
