import pg from "pg";
import { listIdeas, type StoredIdea } from "../db/ideas";
import { sampleIdeas } from "../ideas/fixtures";

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
