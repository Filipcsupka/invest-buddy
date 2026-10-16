import type { OHLCV } from "./types";

/**
 * Company flags (TASK-090). Facts shown next to the score, never inside it: nothing here is read by score(),
 * statusView() or the display percentage. Every flag is flagged, not flagged, or no data. Missing input is
 * no data, never "not flagged".
 */
export const FLAG_IDS = ["dilution", "illiquid", "interestCover", "shortInterest", "drawdown"] as const;
export type FlagId = (typeof FLAG_IDS)[number];
export type FlagState = "flagged" | "clear" | "no-data";

export const FLAG_THRESHOLDS = {
  /** Share count growth over about a year, in percent. */
  dilutionPercent: 10,
  /** Two share counts must be at least this many days apart to count as a year. */
  dilutionMinDays: 300,
  /** Average daily trading value (close times volume), USD, over the window. Same floor as the discovery screen. */
  illiquidUsd: 2_000_000,
  illiquidDays: 20,
  /** Operating income divided by interest expense. */
  interestCover: 1.5,
  /** Percent of float sold short. */
  shortInterestPercent: 20,
  /** Percent under the 20-day high. */
  drawdownPercent: 20,
  drawdownDays: 20,
} as const;

export interface ShareCount { periodEnd: string; value: number }
export interface FlagInput {
  bars: readonly OHLCV[];
  /** Reported share counts (SEC cover page), any order. */
  shares: readonly ShareCount[];
  operatingIncome: number | null;
  interestExpense: number | null;
  /** Short interest as percent of float, null when no source is stored. */
  shortInterestPercent: number | null;
}
export interface FlagResult {
  id: FlagId;
  state: FlagState;
  /** Numbers behind the state, for display. Empty when no data. */
  values: Record<string, number | string>;
}

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;
const r1 = (value: number) => Math.round(value * 10) / 10;
const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const noData = (id: FlagId): FlagResult => ({ id, state: "no-data", values: {} });

function dilution(shares: readonly ShareCount[]): FlagResult {
  const sorted = shares.filter((s) => finite(s.value) && s.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(s.periodEnd)).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = sorted[0];
  if (!latest) return noData("dilution");
  const earlier = sorted.find((s) => days(s.periodEnd, latest.periodEnd) >= FLAG_THRESHOLDS.dilutionMinDays);
  if (!earlier) return noData("dilution");
  const raw = (latest.value / earlier.value - 1) * 100;
  const change = r1(raw);
  return { id: "dilution", state: raw >= FLAG_THRESHOLDS.dilutionPercent ? "flagged" : "clear", values: { change, from: earlier.value, to: latest.value, fromDate: earlier.periodEnd, toDate: latest.periodEnd } };
}

function illiquid(bars: readonly OHLCV[]): FlagResult {
  const recent = bars.slice(-FLAG_THRESHOLDS.illiquidDays);
  if (recent.length < FLAG_THRESHOLDS.illiquidDays || recent.some((b) => !finite(b.close) || !finite(b.volume))) return noData("illiquid");
  const average = Math.round(recent.reduce((sum, b) => sum + b.close * b.volume, 0) / recent.length);
  return { id: "illiquid", state: average < FLAG_THRESHOLDS.illiquidUsd ? "flagged" : "clear", values: { average } };
}

function interestCover(operatingIncome: number | null, interestExpense: number | null): FlagResult {
  if (!finite(operatingIncome) || !finite(interestExpense) || interestExpense < 0) return noData("interestCover");
  // Reported zero interest expense: nothing to cover, so not flagged. Missing interest expense stays no data.
  if (interestExpense === 0) return { id: "interestCover", state: "clear", values: { interestExpense: 0 } };
  const raw = operatingIncome / interestExpense;
  const times = r1(raw);
  return { id: "interestCover", state: raw < FLAG_THRESHOLDS.interestCover ? "flagged" : "clear", values: { times } };
}

function shortInterest(percent: number | null): FlagResult {
  if (!finite(percent) || percent < 0) return noData("shortInterest");
  return { id: "shortInterest", state: percent >= FLAG_THRESHOLDS.shortInterestPercent ? "flagged" : "clear", values: { percent: r1(percent) } };
}

function drawdown(bars: readonly OHLCV[]): FlagResult {
  const recent = bars.slice(-FLAG_THRESHOLDS.drawdownDays);
  if (recent.length < FLAG_THRESHOLDS.drawdownDays) return noData("drawdown");
  const high = Math.max(...recent.map((b) => b.high));
  const close = recent.at(-1)!.close;
  if (!finite(high) || !finite(close) || high <= 0) return noData("drawdown");
  const raw = (1 - close / high) * 100;
  const percent = r1(raw);
  return { id: "drawdown", state: raw >= FLAG_THRESHOLDS.drawdownPercent ? "flagged" : "clear", values: { percent } };
}

/** The five flags in fixed order. Pure; the score is not an input. */
export function companyFlags(input: FlagInput): FlagResult[] {
  return [dilution(input.shares), illiquid(input.bars), interestCover(input.operatingIncome, input.interestExpense), shortInterest(input.shortInterestPercent), drawdown(input.bars)];
}
