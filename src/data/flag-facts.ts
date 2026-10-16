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

/** Latest reported share count per ticker in one query (scanner floor). Missing tickers are absent; empty without a database or on any read error. */
export async function latestShareCounts(tickers: readonly string[]): Promise<Record<string, number>> {
  const db = getPool();
  if (!db || !tickers.length) return {};
  try {
    const result = await db.query<{ ticker: string; value: string | number }>(
      `SELECT DISTINCT ON (f.ticker) f.ticker, f.value FROM fundamentals_pit f
       WHERE f.ticker = ANY($1) AND f.concept = 'EntityCommonStockSharesOutstanding'
         AND EXISTS (SELECT 1 FROM data_sources s WHERE s.id = 'sec' AND s.display_allowed)
       ORDER BY f.ticker, f.period_end DESC, f.filed DESC, f.id DESC`, [[...tickers]]);
    return Object.fromEntries(result.rows.map((row) => [row.ticker, Number(row.value)] as const).filter(([, value]) => Number.isFinite(value)));
  } catch {
    return {};
  }
}
