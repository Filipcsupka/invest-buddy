import { meetsGuidePoints, POINTS_MAX } from "./relative";
import { confirmed, ratings, SIGNAL_RULES, signalFor, type SignalRating, type SignalRules, type SignalSymbolInput, type SizeTier } from "./signals";

/**
 * Graduation line (P6, docs/research-engine.md "Stage 1 is the starter tier"): what the engine still needs before a START_POSITION
 * moves up a tier, STARTER -> STANDARD -> FULL. Written by code from SIGNAL_RULES.startTiers and the rule hits that are not met.
 * The model's upgradeTriggers are a separate line.
 *
 * Pure: no clock, no I/O. It recomputes the signal with signalFor(), so the action and tier are the engine's own.
 * Owner view only: the text names size tiers and ratings, which docs/wording-gate.md keeps off public surfaces.
 */

/** Same groups and fields as COMPANY_RULES, CATALYST_RULES and RULE_FIELDS in signals.ts. graduation.test.ts checks them against ratings(). */
const COMPANY_RULES = ["revenue-acceleration", "earnings", "catalyst", "accumulation"] as const;
const CATALYST_RULES = ["catalyst", "earnings", "accumulation"] as const;
const RULE_FIELDS: Record<string, readonly string[]> = {
  "revenue-acceleration": ["revenueAccelerating"], earnings: ["epsBeat", "guidanceRaised"], catalyst: ["productCatalyst"], accumulation: ["insiderOrInstitutionalBuying"],
};
const RULE_NAMES: Record<string, string> = {
  "revenue-acceleration": "revenue acceleration", earnings: "EPS beat or guidance raise", catalyst: "product catalyst", accumulation: "insider or institutional buying",
};
const ORDER: SignalRating[] = ["Weak", "Neutral", "Good", "Strong", "Very strong"];
const atLeast = (r: SignalRating, min: SignalRating) => ORDER.indexOf(r) >= ORDER.indexOf(min);

export type GraduationTier = "STANDARD" | "FULL";
export type GraduationConditionId = "score" | "company" | "catalyst" | "execution" | "freshData";

/** A Guide rule that would add rating points. carried: the rule matched, but on carried data, so it needs a fresh confirmation. */
export interface MissingRule { id: string; points: number; carried: boolean }
export interface GraduationCondition {
  id: GraduationConditionId;
  met: boolean;
  /** English owner text for an unmet condition, empty when met. */
  text: string;
  /** Rating conditions: points still short of the threshold (0 when only a cap holds the rating down). */
  pointsShort?: number;
  /** Rating conditions: rules not matched or matched on carried data, most points first. */
  missingRules?: MissingRule[];
  /** freshData: key fields whose confirmed value is carried from an earlier date. */
  carriedFields?: { field: string; carriedFrom: string }[];
}
export interface GraduationStep { tier: GraduationTier; met: boolean; conditions: GraduationCondition[] }
export interface Graduation {
  symbol: string;
  /** The tier the engine gives today. */
  tier: SizeTier;
  /** The next tier up, or null when the signal is not a START_POSITION or is already FULL. */
  next: GraduationTier | null;
  /** The next tier first, then FULL when the next tier is STANDARD. */
  steps: GraduationStep[];
  /** One code-written line for the next tier, or null when there is none. */
  line: string | null;
  ruleConfigVersion: string;
}

function ratingCondition(input: SignalSymbolInput, rules: SignalRules, kind: "company" | "catalyst", need: SignalRating): GraduationCondition {
  const r = ratings(input, rules);
  const have = r.ratings[kind];
  if (atLeast(have, need)) return { id: kind, met: true, text: "" };
  const points = r.points[kind];
  const threshold = (kind === "company" ? rules.companyThresholds : rules.catalystThresholds)[need as keyof typeof rules.companyThresholds];
  const group = kind === "company" ? COMPANY_RULES : CATALYST_RULES;
  const max = (input.ruleHits ?? []).filter((h) => (group as readonly string[]).includes(h.id)).reduce((n, h) => n + h.points, 0);
  const carried = (id: string) => (RULE_FIELDS[id] ?? []).some((name) => input.fields[name]?.value === true && Boolean(input.fields[name]?.carriedFrom));
  const missingRules: MissingRule[] = [];
  for (const id of group) {
    const hit = (input.ruleHits ?? []).find((h) => h.id === id);
    if (!hit) continue;
    if (!hit.matched) missingRules.push({ id, points: hit.points, carried: false });
    // A carried hit adds nothing to Catalyst and caps Company at Good, so it needs fresh data to count.
    else if (carried(id) && (kind === "catalyst" || atLeast(need, "Strong"))) missingRules.push({ id, points: hit.points, carried: true });
  }
  missingRules.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  const pointsShort = Math.max(0, threshold - points);
  const parts = missingRules.map((m) => (m.carried ? `${RULE_NAMES[m.id] ?? m.id} on fresh data` : `${RULE_NAMES[m.id] ?? m.id} +${m.points}`));
  const narrative = kind === "company" && rules.narrativeChangedLowersCompany && confirmed(input, "narrativeChanged") === true;
  const notes = [
    `now ${have}, ${points} of ${max} points${pointsShort ? `, ${pointsShort} short` : ""}`,
    ...(parts.length ? [`open: ${parts.join(", ")}`] : []),
    ...(narrative ? ["a confirmed narrative change lowers it one step"] : []),
  ];
  return { id: kind, met: false, text: `${kind} ${need} (${notes.join("; ")})`, pointsShort, missingRules };
}

function stepFor(input: SignalSymbolInput, rules: SignalRules, tier: GraduationTier, unconfirmed: boolean): GraduationStep {
  const t = tier === "FULL" ? rules.startTiers.full : rules.startTiers.standard;
  const evidenced = typeof input.score.evidencedMax === "number" && Number.isFinite(input.score.evidencedMax)
    ? Math.min(POINTS_MAX, Math.max(0, input.score.evidencedMax)) : POINTS_MAX;
  const scoreMet = meetsGuidePoints(input.score.total, evidenced, t.minScore);
  const needed = evidenced > 0 ? Math.ceil((t.minScore * evidenced) / POINTS_MAX) : t.minScore;
  const conditions: GraduationCondition[] = [{
    id: "score", met: scoreMet,
    text: scoreMet ? "" : `score ${needed} of ${evidenced} (now ${input.score.total})`,
  }];
  conditions.push(ratingCondition(input, rules, "company", t.company));
  if (tier === "FULL") {
    conditions.push(ratingCondition(input, rules, "catalyst", rules.startTiers.full.catalyst));
    const execution = confirmed(input, "epsBeat") === true || confirmed(input, "guidanceRaised") === true;
    conditions.push({ id: "execution", met: execution, text: execution ? "" : "a fresh confirmed EPS beat or guidance raise" });
  }
  const carriedFields = rules.keyFields
    .filter((k) => confirmed(input, k) !== null && input.fields[k]?.carriedFrom)
    .map((k) => ({ field: k, carriedFrom: input.fields[k].carriedFrom as string }));
  conditions.push({
    id: "freshData", met: !unconfirmed,
    text: unconfirmed ? `fresh data for ${carriedFields.map((c) => `${c.field} (carried from ${c.carriedFrom})`).join(", ") || "the key fields"}` : "",
    ...(unconfirmed ? { carriedFields } : {}),
  });
  return { tier, met: conditions.every((c) => c.met), conditions };
}

/** The graduation conditions for one symbol. Only a START_POSITION at STARTER or STANDARD has a next tier. */
export function graduation(input: SignalSymbolInput, rules: SignalRules = SIGNAL_RULES): Graduation {
  const sig = signalFor(input, rules);
  const base = { symbol: input.symbol, tier: sig.sizeTier, ruleConfigVersion: rules.version };
  const next: GraduationTier | null = sig.action !== "START_POSITION" ? null : sig.sizeTier === "STARTER" ? "STANDARD" : sig.sizeTier === "STANDARD" ? "FULL" : null;
  if (!next) return { ...base, next: null, steps: [], line: null };
  const tiers: GraduationTier[] = next === "STANDARD" ? ["STANDARD", "FULL"] : ["FULL"];
  const steps = tiers.map((tier) => stepFor(input, rules, tier, sig.unconfirmed));
  const open = steps[0].conditions.filter((c) => !c.met).map((c) => c.text);
  return { ...base, next, steps, line: open.length ? `${next} needs: ${open.join("; ")}.` : null };
}
