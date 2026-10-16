import { technicalIndicators, type AlertState, type RuleHit, type ScoreResult } from "@/engine";
import { DIP_DRAWDOWN } from "@/engine/score";
import { ACCUMULATION_UPDOWN_RATIO } from "@/engine/indicators";
import { fill, formatCompact, formatNumber, formatPercent, formatPrice, getMessages, type Locale, type Messages } from "./index";

import type { StateKey } from "./rules";
export { ruleGroups, stateOrder, type RuleId, type StateKey } from "./rules";

const stateKeys: Record<AlertState, StateKey> = {
  "Setup met (>=18)": "setup",
  Watch: "watch",
  Wait: "wait",
  Ignore: "ignore",
  "Criteria broken": "broken",
  "Insufficient/invalid data": "insufficient",
};

export function stateKey(state: AlertState): StateKey {
  return stateKeys[state];
}

export function ruleLabel(locale: Locale, hit: Pick<RuleHit, "id" | "label">): string {
  const rules = getMessages(locale).rules as Record<string, string>;
  return rules[hit.id] ?? hit.label;
}

export function sectorLabel(locale: Locale, sector: string): string {
  if (sector === "Sample extension" && process.env.DATA_MODE !== "fixture") return getMessages(locale).common.universe;
  const sectors = getMessages(locale).sectors as Record<string, string>;
  return sectors[sector] ?? sector;
}

const reasonKeys: Record<string, keyof Messages["reasons"]> = {
  "Declining revenue": "decliningRevenue",
  "Earnings miss and guidance cut": "earningsMiss",
  "Long-term downtrend: close below MA200": "belowMa200",
  "Long-term downtrend: MA50 below MA200": "ma50BelowMa200",
  "No revenue or meme-pump flag": "noRevenue",
  "At least 200 price bars are required for MA200": "shortHistory",
  "Invalid price series": "invalidSeries",
  "Invalid fundamentals": "invalidFundamentals",
  "Invalid macro inputs": "invalidMacro",
  stale_prices: "stalePrices",
};

/** Translate an engine rejection or validation reason; unknown reasons pass through unchanged. */
export function reasonText(locale: Locale, reason: string): string {
  const reasons = getMessages(locale).reasons;
  const key = reasonKeys[reason];
  if (key) return reasons[key];
  const date = /^Invalid, duplicate, or unsorted date at bar (\d+)$/.exec(reason);
  if (date) return fill(reasons.invalidDate, { n: date[1] });
  const bar = /^Invalid OHLCV at bar (\d+)$/.exec(reason);
  if (bar) return fill(reasons.invalidBar, { n: bar[1] });
  return reason;
}

export function reasonsFor(locale: Locale, result: Pick<ScoreResult, "invalidReasons" | "rejectionReasons">): string[] {
  const list = result.invalidReasons.length ? result.invalidReasons : result.rejectionReasons;
  return list.map((reason) => reasonText(locale, reason));
}

/** Localized evidence line for each rule hit, rebuilt from the scored inputs instead of the engine's English detail. */
export function ruleDetail(locale: Locale, hit: RuleHit, result: ScoreResult): string {
  const m = getMessages(locale);
  const d = m.ruleDetails;
  const f = result.inputs.fundamentals;
  const macro = result.inputs.macro;
  const yesNo = (value: boolean | null) => value === null ? m.common.unknown : value ? m.common.yes : m.common.no;
  const pct = (value: number | null) => value === null ? m.common.unknown : formatPercent(locale, value / 100, 0);
  switch (hit.id) {
    case "revenue-acceleration":
      return fill(d.revenue, { prior: pct(f.revenueGrowthPrior), current: pct(f.revenueGrowthCurrent) });
    case "earnings":
      return fill(d.earnings, { beat: yesNo(f.epsBeat), raised: yesNo(f.guidanceRaised) });
    case "catalyst":
      return fill(d.flag, { value: yesNo(f.productCatalyst) });
    case "accumulation":
      return fill(d.flag, { value: yesNo(f.insiderOrInstitutionalAccumulation) });
    case "rotation":
      return fill(d.flag, { value: yesNo(macro.growthSectorRotation) });
    case "macro-data":
      return fill(d.flag, { value: yesNo(macro.dataTailwind) });
  }
  const t = technicalIndicators(result.inputs.bars);
  switch (hit.id) {
    case "above-ma":
      return fill(d.aboveMa, { close: formatPrice(locale, t.close), ma50: formatPrice(locale, t.ma50), ma200: formatPrice(locale, t.ma200) });
    case "uptrend":
      return fill(d.uptrend, { ma50: formatPrice(locale, t.ma50), ma50Prior: formatPrice(locale, t.ma50TenDaysAgo) });
    case "green-volume":
      return fill(d.volume, { green: formatCompact(locale, t.greenVolume), red: formatCompact(locale, t.redVolume) });
    case "dip":
      return t.drawdown20 === null ? d.unknown : fill(d.dip, { drawdown: formatPercent(locale, t.drawdown20), high: formatPrice(locale, t.high20) });
    default:
      return hit.detail;
  }
}

/** Mean green-day volume must reach this multiple of red-day volume (the 1.2 factor in indicators.ts). */
const GREEN_VOLUME_RATIO = 1.2;

/** "Needs: ..." threshold for one scoring rule, built from the engine constants. */
export function ruleThreshold(locale: Locale, id: string): string | null {
  const m = getMessages(locale);
  const text = (m.ruleThresholds as Record<string, string>)[id];
  if (!text) return null;
  const green = id === "green-volume";
  const filled = fill(text, {
    ratio: formatNumber(locale, green ? GREEN_VOLUME_RATIO : ACCUMULATION_UPDOWN_RATIO, green ? 1 : 2),
    min: formatPercent(locale, DIP_DRAWDOWN.min, 0),
    max: formatPercent(locale, DIP_DRAWDOWN.max, 0),
  });
  return fill(m.company.needs, { text: filled });
}

/** Points cell: "+3 of 3" when met, "0 of 3" when not met, "No data" when the rule has no data. `max` is the rule's possible weight. */
export function rulePointsText(locale: Locale, state: "met" | "not-met" | "no-data", max: number): string {
  const m = getMessages(locale);
  if (state === "no-data") return m.status.noData.charAt(0).toUpperCase() + m.status.noData.slice(1);
  return fill(state === "met" ? m.company.pointsOf : m.company.pointsNone, { points: max, max });
}

export type RejectionCheckId = "revenue" | "earningsMiss" | "belowMa200" | "ma50BelowMa200" | "noRevenue";
export interface RejectionCheck {
  id: RejectionCheckId;
  label: string;
  threshold: string;
  value: string;
  state: "clear" | "triggered" | "no-data";
}

/** The five rejection checks of score.ts with threshold, current value and outcome. Informational: it mirrors the engine and decides nothing. */
export function rejectionChecks(locale: Locale, result: ScoreResult): RejectionCheck[] {
  const m = getMessages(locale);
  const f = result.inputs.fundamentals;
  const t = technicalIndicators(result.inputs.bars);
  const yesNo = (value: boolean | null | undefined) => value === null || value === undefined ? m.common.unknown : value ? m.common.yes : m.common.no;
  const price = (value: number | null) => value === null ? m.common.unknown : formatPrice(locale, value);
  const when = (key: Exclude<keyof Messages["company"]["checks"], "triggersWhen" | "clear" | "triggered">) => fill(m.company.checks.triggersWhen, { text: m.company.checks[key] });
  const growth = f.revenueGrowthCurrent;
  const tri = (hit: boolean, unknown: boolean): RejectionCheck["state"] => hit ? "triggered" : unknown ? "no-data" : "clear";
  const flagged = f.noRevenue === true || f.memePump === true;
  const flagUnknown = f.noRevenue === null || f.memePump === null;
  return [
    {
      id: "revenue", label: m.reasons.decliningRevenue, threshold: when("revenue"),
      value: growth === null ? yesNo(f.revenueDeclining) : `${formatPercent(locale, growth / 100, 0)}; ${yesNo(f.revenueDeclining)}`,
      state: tri(f.revenueDeclining === true || (growth !== null && growth < 0), f.revenueDeclining === null && growth === null),
    },
    { id: "earningsMiss", label: m.reasons.earningsMiss, threshold: when("earningsMiss"), value: yesNo(f.earningsMissAndGuidanceCut), state: tri(f.earningsMissAndGuidanceCut === true, f.earningsMissAndGuidanceCut === null) },
    {
      id: "belowMa200", label: m.reasons.belowMa200, threshold: when("belowMa200"),
      value: `${price(t.close)} / MA200 ${price(t.ma200)}`,
      state: tri(t.ma200 !== null && t.close !== null && t.close < t.ma200, t.ma200 === null || t.close === null),
    },
    {
      id: "ma50BelowMa200", label: m.reasons.ma50BelowMa200, threshold: when("ma50BelowMa200"),
      value: `MA50 ${price(t.ma50)} / MA200 ${price(t.ma200)}`,
      state: tri(t.ma50 !== null && t.ma200 !== null && t.ma50 < t.ma200, t.ma50 === null || t.ma200 === null),
    },
    { id: "noRevenue", label: m.reasons.noRevenue, threshold: when("noRevenue"), value: flagged ? m.common.yes : flagUnknown ? m.common.unknown : m.common.no, state: tri(flagged, flagUnknown) },
  ];
}
