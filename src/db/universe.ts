import type pg from "pg";
import { eodhdPrivateUse } from "../data/eodhd-private-use";

/** Lists that are collected but not scored, shown or sent to a model until promoted (D36: 10 clean sessions, D16). Benchmarks are never part of the universe. */
export const COLLECT_ONLY_LIST = "extended";

/** SQL condition for a membership row that is scored, shown on pages, in the sitemap and eligible for extract and judge. Not for collectors. */
export const scoredMember = (alias = "m") => `${alias}.list NOT IN ('benchmark', '${COLLECT_ONLY_LIST}')`;

/**
 * Owner-private switch. SCORE_EXTENDED=on, only together with EODHD_PRIVATE_USE=on, makes reconcile, macro, daily and the
 * owner-gated score pages include the collect-only list. Judge, extract, ingest routes, the sitemap and the Telegram digest
 * keep `scoredMember`, so the D36 gate for models and public output stays.
 */
export const scoreExtended = (env: Record<string, string | undefined> = process.env): boolean => env.SCORE_EXTENDED === "on" && env.EODHD_PRIVATE_USE === "on";

/** SQL condition for membership rows that are scored: `scoredMember`, plus the collect-only list when `scoreExtended()` is on. */
export const scoringMember = (alias = "m", env: Record<string, string | undefined> = process.env) => scoreExtended(env) ? `${alias}.list <> 'benchmark'` : scoredMember(alias);

/** SQL condition: the ticker held a collect-only membership on `dateSql`. Used to keep stored extended scores out of reads that are not owner-private. */
export const extendedOn = (tickerSql: string, dateSql: string) => `EXISTS (SELECT 1 FROM universe_membership x WHERE x.ticker=${tickerSql} AND x.list='${COLLECT_ONLY_LIST}' AND x.valid_from <= ${dateSql} AND (x.valid_to IS NULL OR x.valid_to > ${dateSql}))`;

/**
 * SQL condition for a stored score row the score pages read. Public mode keeps scan-backed rows only (`scanRunId`).
 * Private EODHD mode also reads rows scored from stored facts: they carry `agreement` from the database provider but no
 * extractor run, because extraction is off. Fixture runs carry neither.
 */
export const pageScoreRow = (alias = "s", env: Record<string, string | undefined> = process.env) =>
  eodhdPrivateUse(env) ? `(${alias}.audit ? 'scanRunId' OR ${alias}.audit ? 'agreement')` : `${alias}.audit ? 'scanRunId'`;

export interface UniverseInstrument { symbol: string; name: string; sector: string; tier: number | null }

/**
 * Membership dates are inclusive at the start and exclusive at the end. Default: names that are scored and shown. `collect: true` adds the collect-only list, for collectors that fetch data only (prices, filings, companyfacts).
 * `scoring: true` is for the scoring jobs (reconcile, macro): it adds the collect-only list only while `scoreExtended()` is on.
 */
export async function loadUniverse(db: Pick<pg.Pool, "query">, asOf?: string, opts: { collect?: boolean; scoring?: boolean } = {}): Promise<UniverseInstrument[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: number | null }>(
    `SELECT i.ticker,i.name,i.sector,m.tier FROM universe_membership m
     JOIN instruments i ON i.ticker=m.ticker
     WHERE ${opts.collect ? "m.list <> 'benchmark'" : opts.scoring ? scoringMember() : scoredMember()} AND m.valid_from <= COALESCE($1::date,CURRENT_DATE)
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
