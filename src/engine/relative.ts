/**
 * Relative scoring (EN45, docs/adr-relative-scoring.md). Pure and dependency-free, so the scorer, the status view, the signals and
 * client components share one rule.
 *
 * Points are measured against the points that have evidence. evidencedMax is 25 minus the weight of every rule whose data is unknown.
 * An unknown rule is left out; a rule with data that is not met still counts as 0 of its weight. A matched rule always has evidence.
 * The band thresholds are shares of evidencedMax equal to the Guide's thresholds on a fully evidenced ticker (s6: 18, 15 and 12 of 25).
 * Below the coverage guard the best band is Watch and the result is flagged as incomplete data.
 */
export const POINTS_MAX = 25;

export const RELATIVE_RULES = {
  /** Percent of evidencedMax per band: 18/25, 15/25 and 12/25. */
  setupPercent: 72,
  watchPercent: 60,
  waitPercent: 48,
  /** Coverage guard: below 20 of 25 evidenced points (80%) the best band is Watch. */
  minEvidencedPoints: 20,
} as const;

export type RelativeBand = "setup" | "watch" | "wait" | "ignore";

/** A rule hit as stored or computed. `unknown` marks a rule with no data. */
export interface EvidenceHit { id?: string; points: number; matched?: boolean; unknown?: boolean }

export interface RelativeScore {
  /** Points that had evidence, out of 25. */
  evidencedMax: number;
  /** total / evidencedMax in percent, one decimal. 0 when nothing had evidence. */
  percent: number;
  /** evidencedMax / 25 in percent, one decimal. */
  coverage: number;
  /** evidencedMax is under the coverage guard. */
  incompleteData: boolean;
  band: RelativeBand;
  /** The share alone reached Setup, and the coverage guard lowered it to Watch. */
  capped: boolean;
}

/** True when the rule had data. A matched rule had data even if a flag says otherwise. */
export const hasEvidence = (hit: Pick<EvidenceHit, "matched" | "unknown">) => hit.matched === true || hit.unknown !== true;

/** Sum of the weights of the rules with data. */
export const evidencedMaxOf = (hits: readonly EvidenceHit[]) => hits.filter(hasEvidence).reduce((sum, hit) => sum + hit.points, 0);

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** total reaches `percent` of evidencedMax. Integer arithmetic, so 18 of 25 is exactly 72%. */
export const meetsPercent = (total: number, evidencedMax: number, percent: number) => evidencedMax > 0 && total * 100 >= percent * evidencedMax;

/** total reaches the share of evidencedMax that `guidePoints` is of 25. Used where the Guide states a point threshold, e.g. 15 or 18. */
export const meetsGuidePoints = (total: number, evidencedMax: number, guidePoints: number) => evidencedMax > 0 && total * POINTS_MAX >= guidePoints * evidencedMax;

export function relativeScore(total: number, evidencedMax: number, rules = RELATIVE_RULES): RelativeScore {
  const max = Math.min(POINTS_MAX, Math.max(0, evidencedMax));
  const share: RelativeBand = meetsPercent(total, max, rules.setupPercent) ? "setup"
    : meetsPercent(total, max, rules.watchPercent) ? "watch"
    : meetsPercent(total, max, rules.waitPercent) ? "wait" : "ignore";
  const incompleteData = max < rules.minEvidencedPoints;
  const capped = incompleteData && share === "setup";
  return {
    evidencedMax: max,
    percent: max > 0 ? Math.min(100, oneDecimal((total * 100) / max)) : 0,
    coverage: oneDecimal((max * 100) / POINTS_MAX),
    incompleteData,
    band: capped ? "watch" : share,
    capped,
  };
}

/** The band the old absolute rule gave: 18, 15 and 12 of 25 whatever the data. Kept for the replay comparison. */
export const absoluteBand = (total: number): RelativeBand => (total >= 18 ? "setup" : total >= 15 ? "watch" : total >= 12 ? "wait" : "ignore");
