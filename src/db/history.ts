import { isIsoDate } from "./iso-date";

/**
 * History read model for the web lane (D43). The web reads these three functions, never the raw tables.
 *
 * Read contract
 * - Each function takes a pool-like `{ query }`, returns plain camelCase rows and a `nextCursor` (null on the last page).
 * - Pages are keyset based and newest first. Pass the previous `nextCursor` as `cursor`. `limit` defaults to 100, maximum 500.
 * - `scoreHistory` returns only date, the three part scores, total and state. `score_results.audit` (inputs, sources,
 *   vendor values) is never selected, so internal-only vendor data cannot leak through it.
 * - `fundamentalsHistory` returns SEC filing facts only, and only while the `sec` row in `data_sources` has
 *   `display_allowed = true` (D4). `first_seen_at` (our collection time) is not returned.
 * - `universeAsOf` returns ticker, list and tier. Reasons and who approved a change stay internal.
 * - `tierLimitDays` is a parameter, not a gate: the web lane decides the number per plan. `null` means no limit.
 *   Rows older than `today - tierLimitDays` are cut. `today` defaults to the current UTC date.
 */

export interface Queryable { query<R = unknown>(text: string, params?: unknown[]): Promise<{ rows: R[] }>; }

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

export interface Page<T> { rows: T[]; nextCursor: string | null; }

export interface ScoreHistoryRow { asOf: string; technical: number; fundamentals: number; macro: number; total: number; state: string; }
export interface ScoreHistoryOptions { from?: string; to?: string; tierLimitDays?: number | null; limit?: number; cursor?: string | null; today?: string; }

export interface FundamentalsHistoryRow {
  concept: string; unit: string; periodStart: string | null; periodEnd: string; fy: number | null; fp: string | null;
  form: string; filed: string; accession: string; value: number;
}
export interface FundamentalsHistoryOptions { from?: string; to?: string; tierLimitDays?: number | null; limit?: number; cursor?: string | null; today?: string; }

export interface UniverseRow { ticker: string; list: string; tier: number | null; validFrom: string; }
export interface UniverseAsOfOptions { limit?: number; cursor?: string | null; }

function limitOf(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  return Math.min(limit, MAX_LIMIT);
}

function dateOf(name: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!isIsoDate(value)) throw new RangeError(`${name} must be a real date as YYYY-MM-DD`);
  return value;
}

/** Earliest day a tier may see, or null for no limit. */
export function depthFloor(tierLimitDays: number | null | undefined, today?: string): string | null {
  if (tierLimitDays === undefined || tierLimitDays === null) return null;
  if (!Number.isInteger(tierLimitDays) || tierLimitDays < 0) throw new RangeError("tierLimitDays must be a non-negative integer or null");
  const end = dateOf("today", today) ?? new Date().toISOString().slice(0, 10);
  const floor = new Date(`${end}T00:00:00Z`);
  floor.setUTCDate(floor.getUTCDate() - tierLimitDays);
  return floor.toISOString().slice(0, 10);
}

/** The later of two optional lower bounds (ISO dates compare as strings). */
const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a ?? b);

function page<T>(rows: (T & { cursorKey: string })[], limit: number): Page<T> {
  const more = rows.length > limit;
  const kept = rows.slice(0, limit);
  const nextCursor = more ? kept[kept.length - 1].cursorKey : null;
  return { rows: kept.map((row) => { const { cursorKey, ...rest } = row; void cursorKey; return rest as unknown as T; }), nextCursor };
}

function cursorDate(cursor: string | null | undefined): string | null {
  if (cursor === null || cursor === undefined) return null;
  if (!isIsoDate(cursor)) throw new RangeError("cursor is not valid");
  return cursor;
}

/** Newest first. Uses `score_results_history (ticker, as_of DESC)`. */
export async function scoreHistory(db: Queryable, ticker: string, options: ScoreHistoryOptions = {}): Promise<Page<ScoreHistoryRow>> {
  const limit = limitOf(options.limit);
  const floor = later(dateOf("from", options.from), depthFloor(options.tierLimitDays, options.today));
  const to = dateOf("to", options.to);
  const before = cursorDate(options.cursor);
  const result = await db.query<ScoreHistoryRow & { cursorKey: string }>(
    `SELECT as_of::text AS "asOf", technical, fundamentals, macro, total, state, as_of::text AS "cursorKey"
     FROM score_results
     WHERE ticker = $1
       AND ($2::date IS NULL OR as_of >= $2::date)
       AND ($3::date IS NULL OR as_of <= $3::date)
       AND ($4::date IS NULL OR as_of < $4::date)
     ORDER BY as_of DESC
     LIMIT $5`,
    [ticker, floor, to, before, limit + 1]);
  return page(result.rows, limit);
}

/**
 * SEC facts for one concept, newest filing first, including earlier versions of restated facts.
 * Cursor is `filed:id`. Uses `fundamentals_pit_as_of_idx (ticker, concept, filed, period_end)`.
 */
export async function fundamentalsHistory(db: Queryable, ticker: string, concept: string, options: FundamentalsHistoryOptions = {}): Promise<Page<FundamentalsHistoryRow>> {
  const limit = limitOf(options.limit);
  const floor = later(dateOf("from", options.from), depthFloor(options.tierLimitDays, options.today));
  const to = dateOf("to", options.to);
  let beforeFiled: string | null = null;
  let beforeId: string | null = null;
  if (options.cursor) {
    const match = /^(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(options.cursor);
    if (!match || !isIsoDate(match[1])) throw new RangeError("cursor is not valid");
    [, beforeFiled, beforeId] = match;
  }
  const result = await db.query<FundamentalsHistoryRow & { cursorKey: string; value: string | number }>(
    `SELECT f.concept, f.unit, f.period_start::text AS "periodStart", f.period_end::text AS "periodEnd", f.fy, f.fp, f.form,
            f.filed::text AS filed, f.accession, f.value, f.filed::text || ':' || f.id::text AS "cursorKey"
     FROM fundamentals_pit f
     WHERE f.ticker = $1 AND f.concept = $2
       AND EXISTS (SELECT 1 FROM data_sources s WHERE s.id = f.source_id AND s.display_allowed)
       AND ($3::date IS NULL OR f.filed >= $3::date)
       AND ($4::date IS NULL OR f.filed <= $4::date)
       AND ($5::date IS NULL OR (f.filed, f.id) < ($5::date, $6::bigint))
     ORDER BY f.filed DESC, f.id DESC
     LIMIT $7`,
    [ticker, concept, floor, to, beforeFiled, beforeId, limit + 1]);
  const converted = result.rows.map((row) => ({ ...row, value: Number(row.value) }));
  return page(converted as (FundamentalsHistoryRow & { cursorKey: string })[], limit);
}

/**
 * Tracked names on `date`; membership is half-open (valid_from <= date < valid_to). Ordered by ticker.
 * Uses `universe_membership_as_of_idx (ticker, valid_from, valid_to)`.
 */
export async function universeAsOf(db: Queryable, date: string, options: UniverseAsOfOptions = {}): Promise<Page<UniverseRow>> {
  if (!isIsoDate(date)) throw new RangeError("date must be a real date as YYYY-MM-DD");
  const limit = limitOf(options.limit);
  const after = options.cursor ?? null;
  const result = await db.query<UniverseRow & { cursorKey: string }>(
    `SELECT ticker, list, tier, valid_from::text AS "validFrom", ticker AS "cursorKey"
     FROM universe_membership
     WHERE valid_from <= $1::date AND (valid_to IS NULL OR valid_to > $1::date)
       AND ($2::text IS NULL OR ticker > $2::text)
     ORDER BY ticker
     LIMIT $3`,
    [date, after, limit + 1]);
  return page(result.rows, limit);
}
