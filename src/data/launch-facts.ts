import { getPool } from "../db/pool";

/** First date with a stored scan, for the landing page. Null in fixture mode, without a database, or on error. */
export async function recordStartDate(): Promise<string | null> {
  if (process.env.DATA_MODE === "fixture") return null;
  const db = getPool();
  if (!db) return null;
  try {
    const result = await db.query<{ first: string | null }>("SELECT MIN(as_of)::text AS first FROM score_results WHERE audit ? 'scanRunId'");
    return result.rows[0]?.first ?? null;
  } catch {
    return null;
  }
}
