import { cache } from "react";
import { flags } from "../config/flags";
import { getPool } from "../db/pool";
import { listIdeas, type StoredIdea } from "../db/ideas";
import { symbolReviewDates } from "../db/extraction-runs";
import { sampleIdeas } from "../ideas/fixtures";
import { showsOnCompanyPage } from "../ideas/public";

/**
 * Ideas carry the owner's EUR band, which ADR-001 keeps out of public pages.
 * The ideas page also requires ADVICE_OUTPUT before it can show action wording.
 */
export const ideasEnabled = () => flags().IDEAS_PAGE;

export interface IdeasData { rows: StoredIdea[]; sample: boolean }
async function latestIdeasUncached(limit = 50): Promise<IdeasData> {
  if (process.env.DATA_MODE === "fixture") return { rows: sampleIdeas, sample: true };
  if (!process.env.DATABASE_URL) return { rows: [], sample: false };
  const db = getPool(); if (!db) return { rows: [], sample: false };
  return { rows: await listIdeas(db, limit), sample: false };
}
/** Per-request memo: the idea card and any other caller with the same limit share one query. */
export const latestIdeas = cache(latestIdeasUncached);

/** Latest idea for one ticker when it is worth a card on the company page (not HOLD). A read failure hides the card instead of breaking the page. */
export async function companyIdea(symbol: string): Promise<{ idea: StoredIdea; sample: boolean } | null> {
  try {
    const data = await latestIdeas(200);
    const idea = data.rows.find((row) => row.symbol === symbol.toUpperCase());
    return idea && showsOnCompanyPage(idea) ? { idea, sample: data.sample } : null;
  } catch { return null; }
}

/** Review dates for the company page stamp. Hidden (null) on fixture data, without a database, or on a read failure. */
export async function companyReview(symbol: string): Promise<{ lastReviewed: string; nextDue: string } | null> {
  if (process.env.DATA_MODE === "fixture" || !process.env.DATABASE_URL) return null;
  const db = getPool(); if (!db) return null;
  try { return await symbolReviewDates(db, symbol.toUpperCase()); }
  catch { return null; }
}
