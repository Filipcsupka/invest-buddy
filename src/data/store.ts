import { cache } from "react";
import { getPool } from "../db/pool";
import type { ScoreResult } from "../engine";
import type { Instrument } from "./providers";
import { scoredUniverse as fixtureUniverse } from "./scored";
import { fixtureRecord } from "./record";
import { instruments as fixtureInstruments } from "./fixtures";
import { samplePortfolio } from "../portfolio/fixture";
import { PostgresPortfolioRepository } from "../db/portfolio";
import { PostgresNavHistoryRepository } from "../db/portfolio-history";
import { buildIndexedSeries, type IndexedSeries } from "../portfolio/history";

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
async function latestScoresUncached(): Promise<StoreData<StoreRow[]>> {
  if (fixtureMode()) { const rows = await fixtureUniverse(); return { rows, sample: true, lastUpdated: rows[0]?.result.asOf ?? null, stale: false }; }
  const db = pool(); if (!db) return { rows: [], sample: false, lastUpdated: null, stale: false };
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; audit: ScoreResult; as_of: string }>(`SELECT DISTINCT ON (s.ticker) s.ticker,i.name,i.sector,m.tier,i.source,s.audit,s.as_of::text FROM score_results s
    JOIN instruments i ON i.ticker=s.ticker JOIN universe_membership m ON m.ticker=i.ticker
    WHERE s.audit ? 'scanRunId' AND m.list <> 'benchmark' AND m.valid_from <= CURRENT_DATE
      AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE) ORDER BY s.ticker,s.as_of DESC`);
  const rows = result.rows.map((row) => ({ instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source }, result: row.audit }));
  const lastUpdated = result.rows.map((row) => row.as_of).sort().at(-1) ?? null;
  return { rows, sample: false, lastUpdated, stale: stale(lastUpdated) };
}
/** Ticker universe: fixture instruments in fixture mode, otherwise current membership. */
async function instrumentUniverseUncached(): Promise<Instrument[]> {
  if (fixtureMode()) return fixtureInstruments;
  const db = pool(); if (!db) return [];
  const result = await db.query<Instrument>(`SELECT i.ticker,i.name,i.sector,m.tier,i.source FROM universe_membership m
    JOIN instruments i ON i.ticker=m.ticker WHERE m.list <> 'benchmark' AND m.valid_from <= CURRENT_DATE
    AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE) ORDER BY i.ticker`);
  return result.rows;
}
export async function scoreHistory(): Promise<StoreData<StoreRow[]>> {
  if (fixtureMode()) { const rows = fixtureRecord(); return { rows, sample: true, lastUpdated: rows[0]?.result.asOf ?? null, stale: false }; }
  const db = pool(); if (!db) return { rows: [], sample: false, lastUpdated: null, stale: false };
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; audit: ScoreResult; as_of: string }>("SELECT s.ticker,i.name,i.sector,i.tier,i.source,s.audit,s.as_of::text FROM score_results s JOIN instruments i ON i.ticker=s.ticker WHERE s.audit ? 'scanRunId' ORDER BY s.as_of DESC,s.ticker");
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
      FROM alerts a JOIN score_results s ON s.ticker=a.ticker AND s.as_of=a.as_of WHERE s.audit ? 'scanRunId' ORDER BY a.as_of DESC,a.ticker`);
  return result.rows.map((row) => ({ ticker: row.ticker, asOf: row.as_of, previousState: row.previous_state, currentState: row.current_state, previousScore: row.previous_score, currentScore: row.current_score }));
}

/** Per-request memo (React cache): generateMetadata and the page share one query. */
export const latestScores = cache(latestScoresUncached);
export const instrumentUniverse = cache(instrumentUniverseUncached);
export const latestPortfolio = cache(latestPortfolioUncached);
