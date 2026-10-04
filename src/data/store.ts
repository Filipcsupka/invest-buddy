import pg from "pg";
import type { ScoreResult } from "../engine";
import type { Instrument } from "./providers";
import { scoredUniverse as fixtureUniverse } from "./scored";
import { fixtureRecord } from "./record";
import { samplePortfolio } from "../portfolio/fixture";
import { PostgresPortfolioRepository } from "../db/portfolio";

export interface StoreRow { instrument: Instrument; result: ScoreResult }
export interface StoreData<T> { rows: T; sample: boolean; lastUpdated: string | null; stale: boolean }
export const stale = (date: string | null) => !!date && Date.now() - Date.parse(`${date}T00:00:00Z`) > 4 * 86_400_000;
const fixtureMode = () => process.env.DATA_MODE === "fixture";
function pool() { if (!process.env.DATABASE_URL) return null; return new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }); }
export async function latestScores(): Promise<StoreData<StoreRow[]>> {
  if (fixtureMode()) { const rows = await fixtureUniverse(); return { rows, sample: true, lastUpdated: rows[0]?.result.asOf ?? null, stale: false }; }
  const db = pool(); if (!db) return { rows: [], sample: false, lastUpdated: null, stale: false };
  try {
    const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; audit: ScoreResult; as_of: string }>(`SELECT DISTINCT ON (s.ticker) s.ticker,i.name,i.sector,i.tier,i.source,s.audit,s.as_of::text FROM score_results s JOIN instruments i ON i.ticker=s.ticker WHERE s.audit ? 'scanRunId' ORDER BY s.ticker,s.as_of DESC`);
    const rows = result.rows.map((row) => ({ instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source }, result: row.audit }));
    const lastUpdated = result.rows.map((row) => row.as_of).sort().at(-1) ?? null;
    return { rows, sample: false, lastUpdated, stale: stale(lastUpdated) };
  } finally { await db.end(); }
}
export async function scoreHistory(): Promise<StoreData<StoreRow[]>> {
  if (fixtureMode()) { const rows = fixtureRecord(); return { rows, sample: true, lastUpdated: rows[0]?.result.asOf ?? null, stale: false }; }
  const db = pool(); if (!db) return { rows: [], sample: false, lastUpdated: null, stale: false };
  try {
    const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: Instrument["source"]; audit: ScoreResult; as_of: string }>("SELECT s.ticker,i.name,i.sector,i.tier,i.source,s.audit,s.as_of::text FROM score_results s JOIN instruments i ON i.ticker=s.ticker WHERE s.audit ? 'scanRunId' ORDER BY s.as_of DESC,s.ticker");
    const rows = result.rows.map((row) => ({ instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source }, result: row.audit }));
    const lastUpdated = result.rows[0]?.as_of ?? null;
    return { rows, sample: false, lastUpdated, stale: stale(lastUpdated) };
  } finally { await db.end(); }
}
export async function latestPortfolio() {
  if (fixtureMode()) return samplePortfolio;
  const db = pool(); if (!db) return null;
  try { return await new PostgresPortfolioRepository(db).latestPublished(new Date().toISOString().slice(0, 10)); }
  finally { await db.end(); }
}

export async function alertHistory() {
  if (fixtureMode()) return [];
  const db = pool(); if (!db) return [];
  try {
    const result = await db.query<{ ticker: string; as_of: string; previous_state: ScoreResult["state"] | null; current_state: ScoreResult["state"]; previous_score: number | null; current_score: number }>(`SELECT a.ticker,a.as_of::text,a.previous_state,a.current_state,a.previous_score,a.current_score
      FROM alerts a JOIN score_results s ON s.ticker=a.ticker AND s.as_of=a.as_of WHERE s.audit ? 'scanRunId' ORDER BY a.as_of DESC,a.ticker`);
    return result.rows.map((row) => ({ ticker: row.ticker, asOf: row.as_of, previousState: row.previous_state, currentState: row.current_state, previousScore: row.previous_score, currentScore: row.current_score }));
  } finally { await db.end(); }
}
