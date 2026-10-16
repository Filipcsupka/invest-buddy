import { getPool } from "../db/pool";
import { fundamentalsHistory } from "../db/history";
import type { ShareCount } from "../engine/flags";

/** Reported share counts (SEC cover page) from stored facts. Empty without a database or on any read error: the flag then shows no data. */
export async function storedShareCounts(ticker: string): Promise<ShareCount[]> {
  const db = getPool();
  if (!db) return [];
  try {
    const page = await fundamentalsHistory(db, ticker, "EntityCommonStockSharesOutstanding", { limit: 40 });
    return page.rows.map((row) => ({ periodEnd: row.periodEnd, value: row.value }));
  } catch {
    return [];
  }
}
