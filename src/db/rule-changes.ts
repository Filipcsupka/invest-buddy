import { isIsoDate } from "./iso-date";
import { getMessages } from "../i18n";
import type { Page, Queryable } from "./history";

/**
 * Rule state changes, derived on read from `score_results.audit` (no table). Only rule id, matched and unknown are
 * picked out of the audit in SQL, so vendor inputs never leave the database. A rule that cannot be evaluated is
 * `unknown`, which is not the same as `fail`.
 */
export type RuleState = "pass" | "fail" | "unknown";
export type RuleLocale = "en" | "sk";
export interface RuleChange { ticker: string; ruleId: string; label: string; from: RuleState; to: RuleState }
export interface RuleHistoryRow { asOf: string; ruleId: string; label: string; from: RuleState; to: RuleState }
export interface RuleHit { id: string; matched: boolean | null; unknown?: boolean | null }

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function ruleState(hit: Pick<RuleHit, "matched" | "unknown">): RuleState {
  if (hit.unknown) return "unknown";
  return hit.matched ? "pass" : "fail";
}

export function ruleLabel(locale: RuleLocale, ruleId: string): string {
  return (getMessages(locale).rules as Record<string, string>)[ruleId] ?? ruleId;
}

/** Rules whose state differs between two days. Rules present on only one side are skipped. No previous day means no changes. */
export function diffRuleStates(previous: readonly RuleHit[] | null, current: readonly RuleHit[]): { ruleId: string; from: RuleState; to: RuleState }[] {
  if (!previous || previous.length === 0) return [];
  const before = new Map(previous.map((hit) => [hit.id, ruleState(hit)]));
  const changes: { ruleId: string; from: RuleState; to: RuleState }[] = [];
  for (const hit of current) {
    const from = before.get(hit.id);
    const to = ruleState(hit);
    if (from !== undefined && from !== to) changes.push({ ruleId: hit.id, from, to });
  }
  return changes;
}

// jsonb_to_recordset keeps only the three named keys; nothing else of the audit is read.
const HITS = `coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'matched', h.matched, 'unknown', coalesce(h.unknown, false)))
  FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(s.audit->'ruleHits') = 'array' THEN s.audit->'ruleHits' ELSE '[]'::jsonb END) AS h(id text, matched boolean, unknown boolean)), '[]'::jsonb)`;

/** Changes between the scored tickers of `asOf` and each ticker's latest earlier day, sorted by ticker then rule id. */
export async function ruleChangesForDate(db: Queryable, asOf: string, locale: RuleLocale = "en"): Promise<RuleChange[]> {
  if (!isIsoDate(asOf)) throw new RangeError("asOf must be YYYY-MM-DD");
  const current = await db.query<{ ticker: string; hits: RuleHit[] }>(
    `SELECT s.ticker, ${HITS} AS hits FROM score_results s WHERE s.as_of = $1::date ORDER BY s.ticker`, [asOf]);
  if (!current.rows.length) return [];
  const previous = await db.query<{ ticker: string; hits: RuleHit[] }>(
    `SELECT DISTINCT ON (s.ticker) s.ticker, ${HITS} AS hits FROM score_results s
     WHERE s.as_of < $1::date AND s.ticker = ANY($2::text[]) ORDER BY s.ticker, s.as_of DESC`,
    [asOf, current.rows.map((row) => row.ticker)]);
  const before = new Map(previous.rows.map((row) => [row.ticker, row.hits]));
  return current.rows.flatMap((row) => diffRuleStates(before.get(row.ticker) ?? null, row.hits)
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    .map((change) => ({ ticker: row.ticker, label: ruleLabel(locale, change.ruleId), ...change })));
}

/** Rule changes of one ticker, newest day first. Cursor is the last returned day; pass it back as `cursor`. Days without a change are skipped. */
export async function ruleHistory(db: Queryable, ticker: string, options: { limit?: number; cursor?: string | null; locale?: RuleLocale } = {}): Promise<Page<RuleHistoryRow>> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  if (options.cursor && !isIsoDate(options.cursor)) throw new RangeError("cursor is not valid");
  const result = await db.query<{ asOf: string; hits: RuleHit[] }>(
    `SELECT s.as_of::text AS "asOf", ${HITS} AS hits FROM score_results s
     WHERE s.ticker = $1 AND ($2::date IS NULL OR s.as_of < $2::date)
     ORDER BY s.as_of DESC LIMIT $3`,
    [ticker, options.cursor ?? null, limit + 1]);
  // The extra row is only the previous day of the oldest kept day.
  const days = result.rows.slice(0, limit);
  const more = result.rows.length > limit;
  const locale = options.locale ?? "en";
  const rows = days.flatMap((day, index) => {
    const prior = result.rows[index + 1];
    return diffRuleStates(prior?.hits ?? null, day.hits).sort((a, b) => a.ruleId.localeCompare(b.ruleId))
      .map((change) => ({ asOf: day.asOf, label: ruleLabel(locale, change.ruleId), ...change }));
  });
  return { rows, nextCursor: more ? days[days.length - 1].asOf : null };
}
