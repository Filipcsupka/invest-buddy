import { getPool } from "../db/pool";
import { CACHE_TAGS, webCached } from "./web-cache";
import { DATASET_IDS, type DatasetDates } from "./data-freshness";

/** Newest stored date per dataset for one ticker. Dates only, never a vendor payload. Macro is not per ticker. Macro and news count only rows whose data_sources.display_allowed is true. */
export const FRESHNESS_SQL = `SELECT 'prices' AS dataset, max(bar_date)::text AS newest FROM daily_bars WHERE ticker = $1
  UNION ALL SELECT 'fundamentals', max(filed)::text FROM fundamentals_pit WHERE ticker = $1
  UNION ALL SELECT 'filings', max(filed_at)::text FROM filing_watch WHERE symbol = $1 AND form IN ('8-K', '8-K/A')
  UNION ALL SELECT 'insider', max(filed_at)::text FROM insider_transactions WHERE ticker = $1
  UNION ALL SELECT 'macro', max(m.obs_date)::text FROM macro_observations m JOIN data_sources s ON s.id = m.source_id AND s.display_allowed
  UNION ALL SELECT 'news', max(d.published_at)::date::text FROM source_documents d JOIN data_sources s ON s.id = d.source AND s.display_allowed WHERE d.symbol = $1 AND d.source IN ('rss', 'gdelt')`;

async function loadUncached(ticker: string): Promise<DatasetDates | null> {
  if (process.env.DATA_MODE === "fixture") return null;
  const db = getPool();
  if (!db) return null;
  try {
    const result = await db.query<{ dataset: string; newest: string | null }>(FRESHNESS_SQL, [ticker]);
    const dates = Object.fromEntries(DATASET_IDS.map((id) => [id, null])) as DatasetDates;
    for (const row of result.rows) if ((DATASET_IDS as readonly string[]).includes(row.dataset)) dates[row.dataset as keyof DatasetDates] = row.newest;
    return dates;
  } catch {
    // The status block is extra. A failed read hides it and leaves the page as it was.
    return null;
  }
}

/** Cached 300 s and purged with the scores tag. Null means no database or fixture data: the block is left out. */
export const datasetFreshness = webCached(loadUncached, "dataset-freshness", [CACHE_TAGS.scores], { bypass: () => !getPool() });
