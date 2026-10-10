import { cache } from "react";
import { getPool } from "../db/pool";
import { scoreHistory, type ScoreHistoryRow } from "../db/history";

/** Most scan days the company page reads. The free depth (W30) is not set yet, so no tier limit applies. */
export const HISTORY_DAYS = 120;

async function companyScoreHistoryUncached(ticker: string): Promise<ScoreHistoryRow[]> {
  if (process.env.DATA_MODE === "fixture" || !process.env.DATABASE_URL) return [];
  const db = getPool(); if (!db) return [];
  try { return (await scoreHistory(db, ticker, { limit: HISTORY_DAYS })).rows; }
  catch { return []; }
}
/** Newest first. A read failure shows the empty state instead of breaking the page. */
export const companyScoreHistory = cache(companyScoreHistoryUncached);
