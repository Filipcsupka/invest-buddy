import { ruleGroups, type RuleId, type StateKey } from "../i18n/rules";

/**
 * One status per ticker for the web and Telegram. Pure: no I/O, no flags read here.
 * The caller passes `adviceOutput` (the ADVICE_OUTPUT flag). Thresholds stay in score.ts.
 */

export type StatusBand = "red" | "orange" | "yellow" | "blue" | "green" | "gray";
export type StatusPosition = 0 | 1 | 2 | 3 | 4;
export type ConfirmationId = "insider" | "epsBeat" | "guidanceRaised" | "catalyst" | "volume";
/** "met", "not-met" or "no-data". Missing data is never "not-met". */
export type ConfirmationState = "met" | "not-met" | "no-data";

export const POINTS_MAX = 25;

/** Dictionary keys, resolved with the locale messages (`status.*`). */
export type StatusLabelKey = `status.labels.${StateKey}` | "status.advice.setup";
export type StatusHeadlineKey = `status.headline.${StateKey}` | "status.headlineAdvice.setup";
export type ConfirmationLabelKey = `status.confirmations.${ConfirmationId}`;

/** A rule hit as stored or computed. `unknown` marks a rule with no data. A rule not listed at all is also no data. */
export interface StatusRuleHit { id: string; matched?: boolean; unknown?: boolean }

/** Optional raw signals for the chips. `null` or absent means no data. */
export interface StatusSignals {
  insiderNetBuy?: boolean | null;
  epsBeat?: boolean | null;
  guidanceRaised?: boolean | null;
  productCatalyst?: boolean | null;
  volumeConfirmation?: boolean | null;
}

export interface StatusInput {
  /** Rule state key as the scorer reports it. An unrecognised value is treated as "insufficient". */
  state: StateKey | string;
  /** Total points, or null when none were calculated. */
  points: number | null;
  ruleHits: readonly StatusRuleHit[] | null | undefined;
  signals?: StatusSignals;
  /** ADVICE_OUTPUT. Off: "Conditions met". On: "Buy zone" and "Zóna nákupu". */
  adviceOutput: boolean;
}

export interface StatusConfirmation { id: ConfirmationId; labelKey: ConfirmationLabelKey; state: ConfirmationState }

export interface StatusCoverage {
  /** Sum of the weights of rules that had data. */
  pointsKnown: number;
  pointsMax: typeof POINTS_MAX;
  unknownRules: RuleId[];
}

export interface StatusView {
  state: StateKey;
  band: StatusBand;
  /** 0 red to 4 green on the slider. null for "insufficient": no marker. */
  position: StatusPosition | null;
  colorToken: `status-${StatusBand}`;
  labelKey: StatusLabelKey;
  headlineKey: StatusHeadlineKey;
  /** Placeholders for the headline. `points` is null when no score exists. */
  headlineParams: { points: number | null; max: typeof POINTS_MAX };
  points: number | null;
  confirmations: StatusConfirmation[];
  coverage: StatusCoverage;
}

const bands: Record<StateKey, { band: StatusBand; position: StatusPosition | null }> = {
  broken: { band: "red", position: 0 },
  ignore: { band: "orange", position: 1 },
  wait: { band: "yellow", position: 2 },
  watch: { band: "blue", position: 3 },
  setup: { band: "green", position: 4 },
  insufficient: { band: "gray", position: null },
};

const states = Object.keys(bands) as StateKey[];
const isState = (value: unknown): value is StateKey => typeof value === "string" && (states as string[]).includes(value);

const allRules = ruleGroups.flatMap((group) => group.rules);

const chips: { id: ConfirmationId; signal: keyof StatusSignals; rule?: RuleId }[] = [
  { id: "insider", signal: "insiderNetBuy" },
  { id: "epsBeat", signal: "epsBeat" },
  { id: "guidanceRaised", signal: "guidanceRaised" },
  { id: "catalyst", signal: "productCatalyst", rule: "catalyst" },
  { id: "volume", signal: "volumeConfirmation", rule: "green-volume" },
];

export function coverage(ruleHits: StatusInput["ruleHits"]): StatusCoverage {
  const byId = new Map((ruleHits ?? []).map((hit) => [hit.id, hit]));
  const unknownRules: RuleId[] = [];
  let pointsKnown = 0;
  for (const rule of allRules) {
    const hit = byId.get(rule.id);
    if (!hit || hit.unknown === true) unknownRules.push(rule.id);
    else pointsKnown += rule.points;
  }
  return { pointsKnown, pointsMax: POINTS_MAX, unknownRules };
}

function confirmationState(value: boolean | null | undefined, hit: StatusRuleHit | undefined): ConfirmationState {
  if (typeof value === "boolean") return value ? "met" : "not-met";
  if (value === undefined && hit && hit.unknown !== true && typeof hit.matched === "boolean") return hit.matched ? "met" : "not-met";
  return "no-data";
}

export function statusView(input: StatusInput): StatusView {
  const state: StateKey = isState(input.state) ? input.state : "insufficient";
  const { band, position } = bands[state];
  const points = state !== "insufficient" && typeof input.points === "number" && Number.isFinite(input.points)
    ? Math.min(POINTS_MAX, Math.max(0, input.points)) : null;
  const byId = new Map((input.ruleHits ?? []).map((hit) => [hit.id, hit]));
  const signals = input.signals ?? {};
  const advice = input.adviceOutput && state === "setup";
  return {
    state, band, position,
    colorToken: `status-${band}`,
    labelKey: advice ? "status.advice.setup" : `status.labels.${state}`,
    headlineKey: advice ? "status.headlineAdvice.setup" : `status.headline.${state}`,
    headlineParams: { points, max: POINTS_MAX },
    points,
    confirmations: chips.map((chip) => ({
      id: chip.id,
      labelKey: `status.confirmations.${chip.id}` as ConfirmationLabelKey,
      state: confirmationState(signals[chip.signal], chip.rule ? byId.get(chip.rule) : undefined),
    })),
    coverage: coverage(input.ruleHits),
  };
}
