import type { OHLCV } from "../engine/types";
import { checkTicker } from "../jobs/dq";
import { barMetrics } from "./select";

/**
 * Promotion from the collect-only list `extended` to `core` (D36). A name qualifies after 10 clean sessions in a row (D16): for each of the
 * last 10 completed sessions, all on or after the day the name joined `extended`, a stored bar exists for that session and the D16 price
 * checks run on the bars up to it give no `fail`. Bars fetched for history before the name joined do not count.
 * Promotion is capped per week because a core name is scored and goes to extract and judge, which costs AI tokens.
 */
export const PROMOTE = {
  cleanSessions: 10,
  /** Promotions a week (Monday to Sunday, UTC dates). */
  weeklyCap: 10,
  actor: "universe-promote",
};

export interface PromoteCandidate { ticker: string; name: string; validFrom: string; bars: OHLCV[]; yoyGrowthPct: number | null }
export interface Promotion { ticker: string; name: string; yoyGrowthPct: number | null; avgDollarVolume50: number | null; cleanSessions: number }
export interface PromotePlan { promote: Promotion[]; eligible: Promotion[]; waiting: { ticker: string; cleanSessions: number }[]; weekStart: string; alreadyThisWeek: number; cap: number }

const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Monday of the UTC week that holds the date. */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** One session is clean when its bar is stored and the D16 checks, run as of that session on the bars up to it, have no `fail`. */
export function isCleanSession(bars: OHLCV[], session: string): boolean {
  const upTo = bars.filter((bar) => bar.date <= session);
  if (!upTo.some((bar) => bar.date === session)) return false;
  return checkTicker({ ticker: "", bars: upTo }, { asOf: session, today: session }).every((row) => row.status !== "fail");
}

/** Clean sessions in a row, counted back from the newest session, stopping at the first unclean one or at the membership start. */
export function cleanSessionRun(bars: OHLCV[], sessions: readonly string[], validFrom: string): number {
  let run = 0;
  for (const session of [...sessions].sort().reverse()) {
    if (session < validFrom || !isCleanSession(bars, session)) break;
    run++;
  }
  return run;
}

/**
 * Pure plan. `sessions` are the most recent completed sessions, at least `cleanSessions` of them. Eligible names are ordered like the
 * selection ranking: growth (unknown last), then 50-day dollar volume, then ticker. At most cap minus this week's promotions are taken.
 */
export function planPromotions(candidates: PromoteCandidate[], sessions: readonly string[], opts: { today: string; alreadyThisWeek: number; cap?: number; cleanSessions?: number }): PromotePlan {
  const need = opts.cleanSessions ?? PROMOTE.cleanSessions;
  const cap = opts.cap ?? PROMOTE.weeklyCap;
  if (!Number.isInteger(cap) || cap < 0) throw new Error("cap must be a non-negative whole number");
  const recent = [...sessions].sort().slice(-need);
  if (recent.length < need) throw new Error(`need ${need} sessions, got ${recent.length}`);
  const eligible: Promotion[] = [], waiting: PromotePlan["waiting"] = [];
  for (const c of candidates) {
    const run = cleanSessionRun(c.bars, recent, c.validFrom);
    if (run >= need) eligible.push({ ticker: c.ticker, name: c.name, yoyGrowthPct: c.yoyGrowthPct, avgDollarVolume50: barMetrics([...c.bars].sort((a, b) => a.date.localeCompare(b.date))).avgDollarVolume50, cleanSessions: run });
    else waiting.push({ ticker: c.ticker, cleanSessions: run });
  }
  const rank = (v: number | null) => v ?? Number.NEGATIVE_INFINITY;
  eligible.sort((a, b) => rank(b.yoyGrowthPct) - rank(a.yoyGrowthPct) || rank(b.avgDollarVolume50) - rank(a.avgDollarVolume50) || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  const left = Math.max(0, cap - opts.alreadyThisWeek);
  return { promote: eligible.slice(0, left), eligible, waiting: waiting.sort((a, b) => (a.ticker < b.ticker ? -1 : 1)), weekStart: weekStartOf(opts.today), alreadyThisWeek: opts.alreadyThisWeek, cap };
}
