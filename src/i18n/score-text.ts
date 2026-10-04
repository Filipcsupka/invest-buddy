import { technicalIndicators, type AlertState, type RuleHit, type ScoreResult } from "@/engine";
import { fill, formatCompact, formatPercent, formatPrice, getMessages, type Locale, type Messages } from "./index";

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
