import { technicalIndicators, volumeAccumulation } from "./indicators";
import { evidencedMaxOf, relativeScore, type RelativeBand } from "./relative";
import type { AlertState, Fundamentals, Macro, OHLCV, RuleHit, ScoreInputs, ScoreResult } from "./types";

/**
 * Bump when the scoring rules change; each new record snapshot stores this value.
 * 2026-10-11.1 (EN45): states use the share of evidenced points and the coverage guard (src/engine/relative.ts).
 * 2026-10-11.2 (EN45): a rule built from two inputs is unknown when no input is true and one has no data; planned fields count as no data.
 */
export const SCORE_RULES_VERSION = "2026-10-11.2";

/**
 * Three-valued OR: true when any input is true, unknown (null) when none is true and one has no data, else false.
 * A rule with partial data is never counted as a failed check.
 */
export function anyOf(...parts: (boolean | null | undefined)[]): boolean | null {
  if (parts.some((part) => part === true)) return true;
  return parts.some((part) => part === null || part === undefined) ? null : false;
}

/** Input fields a planned data source would fill (paid data or not built yet). The scorer treats each one exactly like no data. */
export type PlannedField = keyof Fundamentals | keyof Macro;
export interface ScoreOptions { planned?: readonly PlannedField[] }
const MACRO_FIELDS: readonly string[] = ["growthSectorRotation", "dataTailwind"];

/** Stored state strings stay as they were, so older audits, alerts and the track record still parse. */
const STATE_FOR_BAND: Record<RelativeBand, AlertState> = { setup: "Setup met (>=18)", watch: "Watch", wait: "Wait", ignore: "Ignore" };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const boolean = (value: unknown) => typeof value === "boolean" || value === null;

export function accumulationRule(volume: boolean | null, insider: boolean | null): boolean | null {
  return anyOf(volume, insider);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function validate(bars: OHLCV[], fundamentals: Fundamentals, macro: Macro): string[] {
  const reasons: string[] = [];
  if (!Array.isArray(bars)) return ["Invalid price series"];
  if (bars.length < 200) reasons.push("At least 200 price bars are required for MA200");
  let previousDate = "";
  for (const [index, bar] of bars.entries()) {
    if (!bar || !validDate(bar.date) || bar.date <= previousDate) {
      reasons.push(`Invalid, duplicate, or unsorted date at bar ${index + 1}`);
    } else {
      previousDate = bar.date;
    }
    if (!bar || ![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) && value > 0) || !finite(bar.volume) || bar.volume < 0 || bar.high < bar.low || bar.open < bar.low || bar.open > bar.high || bar.close < bar.low || bar.close > bar.high) {
      reasons.push(`Invalid OHLCV at bar ${index + 1}`);
    }
  }
  if (!fundamentals || !(finite(fundamentals.revenueGrowthCurrent) || fundamentals.revenueGrowthCurrent === null) || !(finite(fundamentals.revenueGrowthPrior) || fundamentals.revenueGrowthPrior === null) || ![
    fundamentals.revenueDeclining, fundamentals.epsBeat, fundamentals.guidanceRaised,
    fundamentals.earningsMissAndGuidanceCut, fundamentals.productCatalyst,
    fundamentals.insiderOrInstitutionalAccumulation, fundamentals.noRevenue, fundamentals.memePump,
  ].every(boolean)) reasons.push("Invalid fundamentals");
  if (!macro || ![macro.growthSectorRotation, macro.dataTailwind].every(boolean)) reasons.push("Invalid macro inputs");
  return reasons;
}

export function score(input: ScoreInputs, options: ScoreOptions = {}): ScoreResult {
  const bars = Array.isArray(input.bars) ? input.bars.map((bar) => bar && { ...bar }) : [];
  const normalized: ScoreInputs = { ticker: input.ticker, bars, fundamentals: { ...input.fundamentals }, macro: { ...input.macro } };
  const planned = [...new Set(options.planned ?? [])].sort();
  for (const field of planned) {
    const target = (MACRO_FIELDS.includes(field) ? normalized.macro : normalized.fundamentals) as unknown as Record<string, unknown>;
    target[field] = null;
  }
  const plannedAudit = planned.length ? { plannedFields: planned } : {};
  const invalidReasons = validate(input.bars, planned.length ? normalized.fundamentals : input.fundamentals, planned.length ? normalized.macro : input.macro);
  if (invalidReasons.length) return {
    ticker: input.ticker, asOf: "", technical: 0, fundamentals: 0, macro: 0, total: 0,
    state: "Insufficient/invalid data", pullbackInUptrend: false, invalidReasons,
    inputs: normalized, ruleHits: [], rejectionReasons: [], evidencedMax: 0, percent: 0, coverage: 0, incompleteData: true, ...plannedAudit,
  };
  const indicator = technicalIndicators(bars);
  const accumulation = volumeAccumulation(bars);
  const f = normalized.fundamentals;
  const m = normalized.macro;
  const hits: RuleHit[] = [];
  const add = (id: string, label: string, points: number, matched: boolean | null, detail: string, unknown = false) => hits.push({ id, label, points, matched: matched === true, detail, unknown });
  add("revenue-acceleration", "Revenue growth accelerated", 4, (f.revenueAccelerating ?? (f.revenueGrowthCurrent !== null && f.revenueGrowthPrior !== null && f.revenueGrowthCurrent > f.revenueGrowthPrior)) && f.revenueDeclining === false, f.revenueAccelerating === null ? "unknown" : `${f.revenueGrowthPrior ?? "unknown"}% → ${f.revenueGrowthCurrent ?? "unknown"}%`, f.revenueAccelerating === null || (f.revenueAccelerating === undefined && (f.revenueGrowthCurrent === null || f.revenueGrowthPrior === null)));
  const earnings = anyOf(f.epsBeat, f.guidanceRaised);
  add("earnings", "EPS beat or guidance raised", 3, earnings, `EPS beat: ${f.epsBeat ?? "unknown"}; guidance raised: ${f.guidanceRaised ?? "unknown"}`, earnings === null);
  add("catalyst", "Curated product catalyst", 2, f.productCatalyst, String(f.productCatalyst ?? "unknown"), f.productCatalyst === null);
  const accumulationMatched = accumulationRule(accumulation.matched, f.insiderOrInstitutionalAccumulation);
  add("accumulation", "Institutional or insider accumulation", 1,
    accumulationMatched,
    `up/down volume ${accumulation.ratio === null ? "unknown" : Number.isFinite(accumulation.ratio) ? accumulation.ratio.toFixed(2) : "∞"}; insider buying: ${f.insiderOrInstitutionalAccumulation ?? "unknown"}`,
    accumulationMatched === null);
  add("above-ma", "Close above MA50 and MA200", 3, indicator.aboveBoth, `Close ${indicator.close}; MA50 ${indicator.ma50}; MA200 ${indicator.ma200}`);
  add("uptrend", "Uptrend intact", 3, indicator.uptrend, `MA50 ten days ago ${indicator.ma50TenDaysAgo}`);
  add("green-volume", "Higher volume on green days", 2, indicator.volumeOnGreen, `Green ${indicator.greenVolume}; red ${indicator.redVolume}`);
  const pullbackInUptrend = indicator.uptrend && indicator.drawdown20 !== null && indicator.drawdown20 >= 0.05 && indicator.drawdown20 <= 0.1;
  add("dip", "5–10% drawdown from 20-day high in uptrend", 2, pullbackInUptrend, `Drawdown ${indicator.drawdown20 === null ? "unknown" : (indicator.drawdown20 * 100).toFixed(1) + "%"}`);
  add("rotation", "Growth sector rotation", 2, m.growthSectorRotation, String(m.growthSectorRotation ?? "unknown"), m.growthSectorRotation === null);
  add("macro-data", "Macro data tailwind", 3, m.dataTailwind, String(m.dataTailwind ?? "unknown"), m.dataTailwind === null);
  const sum = (ids: string[]) => hits.filter((hit) => ids.includes(hit.id) && hit.matched).reduce((total, hit) => total + hit.points, 0);
  const fundamentals = sum(["revenue-acceleration", "earnings", "catalyst", "accumulation"]);
  const technical = sum(["above-ma", "uptrend", "green-volume", "dip"]);
  const macro = sum(["rotation", "macro-data"]);
  const total = fundamentals + technical + macro;
  const rejectionReasons = [
    ...(f.revenueDeclining || (f.revenueGrowthCurrent !== null && f.revenueGrowthCurrent < 0) ? ["Declining revenue"] : []),
    ...(f.earningsMissAndGuidanceCut ? ["Earnings miss and guidance cut"] : []),
    ...(indicator.ma200 !== null && indicator.close !== null && indicator.close < indicator.ma200 ? ["Long-term downtrend: close below MA200"] : []),
    ...(indicator.ma50 !== null && indicator.ma200 !== null && indicator.ma50 < indicator.ma200 ? ["Long-term downtrend: MA50 below MA200"] : []),
    ...(f.noRevenue || f.memePump ? ["No revenue or meme-pump flag"] : []),
  ];
  // Relative rule: total against the points with evidence; under 20 evidenced points the best state is Watch.
  const relative = relativeScore(total, evidencedMaxOf(hits));
  const state: AlertState = rejectionReasons.length ? "Criteria broken" : STATE_FOR_BAND[relative.band];
  return {
    ticker: input.ticker, asOf: bars.at(-1)?.date ?? "", technical, fundamentals, macro, total, state, pullbackInUptrend, invalidReasons, inputs: normalized, ruleHits: hits, rejectionReasons,
    evidencedMax: relative.evidencedMax, percent: relative.percent, coverage: relative.coverage, incompleteData: relative.incompleteData, ...plannedAudit,
  };
}
