import { DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT } from "../data/eps";
import { DEFAULT_INSIDER_MIN_NET_BUY_USD } from "../data/insider";
import { SCORE_RULES_VERSION } from "../engine/score";
import { SIGNAL_RULES } from "../engine/signals";
import { GATE } from "../jobs/gate-config";

/**
 * One place that lists the tunable rule values and where each one comes from. The values live in their own modules; this file re-exports them so
 * a reader and the hash test see them together. Changing a value here or in its module needs a RULESET_VERSION change, a line in
 * docs/rules-changelog.md and a new hash in src/config/rules.test.ts.
 */

/** Placeholder bands, owner sign-off F6 (docs/tasks-open.md). Price is a review trigger, never a sell signal. Not in InvestingGuide.md. */
export { GATE };

/** Placeholder, owner (C5c: keep 0 or use 2). Surprise in percent of the estimate; override with EPS_BEAT_MIN_SURPRISE_PCT. Not in InvestingGuide.md. */
export const EPS_BEAT_MIN_SURPRISE_PCT = DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT;

/** Placeholder, owner (F6). Net open-market buying in USD over 90 days before Form 4 data counts as accumulation; override with INSIDER_MIN_NET_BUY_USD. */
export const INSIDER_MIN_NET_BUY_USD = DEFAULT_INSIDER_MIN_NET_BUY_USD;

/**
 * Placeholder, owner (F6): yearly turnover target in percent, from docs/cadence-design.md. Documentation only: no code reads it.
 * It is listed so the F6 placeholders sit in one file; a consumer would need its own change and version bump.
 */
export const TURNOVER_TARGET_PCT = 30;

/** Score rules version and signal rules version as one string. Stored versions elsewhere stay as they are (see docs/rules-changelog.md). */
export const RULESET_VERSION = `${SCORE_RULES_VERSION}+${SIGNAL_RULES.version}`;

/** Everything the hash test covers. Functions are dropped by JSON, so only values count. */
export const RULES_SNAPSHOT = {
  scoreRulesVersion: SCORE_RULES_VERSION,
  signalRules: SIGNAL_RULES,
  gate: GATE,
  epsBeatMinSurprisePct: EPS_BEAT_MIN_SURPRISE_PCT,
  insiderMinNetBuyUsd: INSIDER_MIN_NET_BUY_USD,
  turnoverTargetPct: TURNOVER_TARGET_PCT,
};
