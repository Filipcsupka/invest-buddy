import { cache } from "react";
import { CACHE_TAGS, webCached } from "../data/web-cache";
import { getPool } from "./pool";
import { isIsoDate } from "./iso-date";
import { HITS, ruleState, type RuleHit } from "./rule-changes";
import type { Queryable } from "./history";

/**
 * Rules-met streak per ticker, derived on read from the daily `score_results` snapshots (no table). Only rule id,
 * matched and unknown are read from the audit (see HITS in rule-changes), so vendor inputs stay in the database.
 */
export interface RuleDay { asOf: string; hits: readonly Pick<RuleHit, "id" | "matched" | "unknown">[] }
export interface RuleStreak {
  /** Rules met on the latest snapshot. */
  met: string[];
  /** Calendar days since the set of met rules last changed. 0 means it changed on the latest snapshot. */
  sinceDays: number;
  /** The history window ended before the set changed, so the true streak is at least `sinceDays`. */
  atLeast: boolean;
  /** Met now, not met on the baseline day a week earlier. */
  gained: string[];
  /** Met on the baseline day, failed now. A rule that became unknown is not counted as lost. */
  lost: string[];
}

export const STREAK_WINDOW_DAYS = 90;
export const CHANGE_WINDOW_DAYS = 7;

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const metSet = (day: RuleDay) => new Set(day.hits.filter((hit) => ruleState(hit) === "pass").map((hit) => hit.id));
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * `days` is one ticker's snapshots, newest first. Baseline for gained and lost is the latest snapshot at least
 * `CHANGE_WINDOW_DAYS` before the newest day, or the oldest snapshot when history is shorter (so a young ticker compares
 * against its first day). With a single snapshot nothing is gained or lost.
 */
export function ruleStreak(days: readonly RuleDay[]): RuleStreak | null {
  if (!days.length) return null;
  const latest = days[0];
  const now = metSet(latest);
  let oldestSame = latest.asOf;
  let reachedEnd = true;
  for (const day of days.slice(1)) {
    if (!sameSet(metSet(day), now)) { reachedEnd = false; break; }
    oldestSame = day.asOf;
  }
  const baseline = days.length > 1 ? (days.find((day, index) => index > 0 && daysBetween(day.asOf, latest.asOf) >= CHANGE_WINDOW_DAYS) ?? days[days.length - 1]) : null;
  const before = baseline ? metSet(baseline) : null;
  const failedNow = new Set(latest.hits.filter((hit) => ruleState(hit) === "fail").map((hit) => hit.id));
  return {
    met: [...now].sort(),
    sinceDays: daysBetween(oldestSame, latest.asOf),
    atLeast: reachedEnd && days.length > 1,
    gained: before ? [...now].filter((id) => !before.has(id)).sort() : [],
    lost: before ? [...before].filter((id) => failedNow.has(id)).sort() : [],
  };
}

/** Groups rows (ticker, day, hits) into streaks. Rows may arrive in any order. */
export function streaksFromRows(rows: readonly { ticker: string; asOf: string; hits: RuleDay["hits"] }[]): Record<string, RuleStreak> {
  const byTicker = new Map<string, RuleDay[]>();
  for (const row of rows) byTicker.set(row.ticker, [...(byTicker.get(row.ticker) ?? []), { asOf: row.asOf, hits: row.hits }]);
  const out: Record<string, RuleStreak> = {};
  for (const [ticker, days] of byTicker) {
    const streak = ruleStreak(days.sort((a, b) => b.asOf.localeCompare(a.asOf)));
    if (streak) out[ticker] = streak;
  }
  return out;
}

/** Streaks of every scored ticker over the last `STREAK_WINDOW_DAYS` days before the newest snapshot. One query. */
export async function ruleStreaksFromDb(db: Queryable, window = STREAK_WINDOW_DAYS): Promise<Record<string, RuleStreak>> {
  const result = await db.query<{ ticker: string; asOf: string; hits: RuleDay["hits"] }>(
    `SELECT s.ticker, s.as_of::text AS "asOf", ${HITS} AS hits FROM score_results s
     WHERE s.audit ? 'scanRunId' AND s.as_of >= (SELECT max(as_of) FROM score_results WHERE audit ? 'scanRunId') - $1::int
     ORDER BY s.ticker, s.as_of DESC`, [window]);
  return streaksFromRows(result.rows.filter((row) => isIsoDate(row.asOf)));
}

async function loadStreaks(): Promise<Record<string, RuleStreak>> {
  if (process.env.DATA_MODE === "fixture") {
    const { fixtureRecord } = await import("../data/record");
    return streaksFromRows(fixtureRecord().map(({ result }) => ({ ticker: result.ticker, asOf: result.asOf, hits: result.ruleHits })));
  }
  const db = getPool();
  return db ? ruleStreaksFromDb(db) : {};
}

/** Public, viewer-independent read: cached 300 s like the other web reads (W5), purged with the scores tag. */
export const ruleStreaks = cache(webCached(loadStreaks, "rule-streaks", [CACHE_TAGS.scores], { bypass: () => !getPool() }));
