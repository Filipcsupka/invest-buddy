import { ruleGroups, type RuleId, type StateKey } from "@/i18n/rules";
import { hasEvidence, relativeScore, RELATIVE_RULES } from "./relative";

/** Presentation only. Historical points, audits, signals and score() remain unchanged. */
export const BONUS_RULE_IDS: readonly RuleId[] = ["catalyst"];
const bonus = new Set<RuleId>(BONUS_RULE_IDS);
export const CORE_RULES = ruleGroups.flatMap((group) => group.rules).filter((rule) => !bonus.has(rule.id));
export const CORE_MAX = CORE_RULES.reduce((sum, rule) => sum + rule.points, 0);

export interface DisplayHit { id: string; matched?: boolean; unknown?: boolean }

export function displayScore(state: StateKey, hits: readonly DisplayHit[]) {
  const byId = new Map(hits.map((hit) => [hit.id, hit]));
  const evidenced = CORE_RULES.filter((rule) => {
    const hit = byId.get(rule.id);
    return hit && hasEvidence(hit);
  });
  const earned = evidenced.reduce((sum, rule) => sum + (byId.get(rule.id)?.matched ? rule.points : 0), 0);
  const evidencedMax = evidenced.reduce((sum, rule) => sum + rule.points, 0);
  const relative = relativeScore(earned, evidencedMax, { ...RELATIVE_RULES, minEvidencedPoints: Math.ceil(CORE_MAX * 0.8) });
  const displayState: StateKey = state === "broken" || state === "insufficient" ? state : !evidencedMax ? "insufficient" : relative.band;
  return {
    state: displayState,
    percent: displayState === "broken" || displayState === "insufficient" ? null : relative.percent,
    earned,
    evidencedMax,
    coreKnown: evidenced.length,
    coreTotal: CORE_RULES.length,
    unknownCore: CORE_RULES.filter((rule) => !evidenced.some((known) => known.id === rule.id)).map((rule) => rule.id),
    incomplete: relative.incompleteData,
    bonus: BONUS_RULE_IDS.map((id) => ({ id, hit: byId.get(id) })),
  };
}
