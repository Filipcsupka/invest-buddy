import pg from "pg";
import { listIdeas, type StoredIdea } from "../db/ideas";
import { sampleIdeas } from "../ideas/fixtures";
import { showsOnCompanyPage } from "../ideas/public";

/**
 * Ideas carry EUR amounts sized to one private portfolio, which ADR-001 keeps out of the public product.
 * The page and its nav link therefore stay hidden unless IDEAS_PAGE=on, or the app runs on fixture data.
 */
export const ideasEnabled = () => process.env.IDEAS_PAGE === "on" || process.env.DATA_MODE === "fixture";

export interface IdeasData { rows: StoredIdea[]; sample: boolean }
export async function latestIdeas(limit = 50): Promise<IdeasData> {
  if (process.env.DATA_MODE === "fixture") return { rows: sampleIdeas, sample: true };
  if (!process.env.DATABASE_URL) return { rows: [], sample: false };
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try { return { rows: await listIdeas(db, limit), sample: false }; }
  finally { await db.end(); }
}

/** Latest idea for one ticker when it is worth a card on the company page (not HOLD). A read failure hides the card instead of breaking the page. */
export async function companyIdea(symbol: string): Promise<{ idea: StoredIdea; sample: boolean } | null> {
  try {
    const data = await latestIdeas(200);
    const idea = data.rows.find((row) => row.symbol === symbol.toUpperCase());
    return idea && showsOnCompanyPage(idea) ? { idea, sample: data.sample } : null;
  } catch { return null; }
}
