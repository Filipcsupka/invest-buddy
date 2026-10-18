import type pg from "pg";

/** Lists that are collected but not scored, shown or sent to a model until promoted (D36: 10 clean sessions, D16). Benchmarks are never part of the universe. */
export const COLLECT_ONLY_LIST = "extended";

/** SQL condition for a membership row that is scored, shown on pages, in the sitemap and eligible for extract and judge. Not for collectors. */
export const scoredMember = (alias = "m") => `${alias}.list NOT IN ('benchmark', '${COLLECT_ONLY_LIST}')`;

export interface UniverseInstrument { symbol: string; name: string; sector: string; tier: number | null }

/** Membership dates are inclusive at the start and exclusive at the end. Default: names that are scored and shown. `collect: true` adds the collect-only list, for collectors that fetch data only (prices, filings, companyfacts). */
export async function loadUniverse(db: Pick<pg.Pool, "query">, asOf?: string, opts: { collect?: boolean } = {}): Promise<UniverseInstrument[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: number | null }>(
    `SELECT i.ticker,i.name,i.sector,m.tier FROM universe_membership m
     JOIN instruments i ON i.ticker=m.ticker
     WHERE ${opts.collect ? "m.list <> 'benchmark'" : scoredMember()} AND m.valid_from <= COALESCE($1::date,CURRENT_DATE)
       AND (m.valid_to IS NULL OR m.valid_to > COALESCE($1::date,CURRENT_DATE)) ORDER BY i.ticker`,
    [asOf ?? null],
  );
  return result.rows.map((row) => ({ symbol: row.ticker, name: row.name, sector: row.sector, tier: row.tier }));
}

/** True when the ticker is currently scored and shown (benchmarks and the collect-only list excluded). */
export async function isKnownInstrument(db: Pick<pg.Pool, "query">, symbol: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM universe_membership WHERE ticker=$1 AND list NOT IN ('benchmark', 'extended') AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to > CURRENT_DATE) LIMIT 1", [symbol]);
  return (result.rowCount ?? 0) > 0;
}
