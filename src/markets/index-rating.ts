/**
 * Index market-condition rating (index plan task 3).
 *
 * Pure and deterministic: no DB, clock or network access. The result describes
 * measured conditions on the as-of date. It is informational screening under
 * ADR-001, not a forecast or an instruction. Methodology: docs/index-rating.md.
 */

// TODO(merge): writer I1 owns `IndexRatingInputs` in src/markets/index-types.ts.
// This is the identical shape, declared locally until that branch lands.
export interface IndexRatingInputs {
  symbol: string;
  /** ISO date (YYYY-MM-DD). Bars after this date are ignored. */
  asOf: string;
  /** Daily closes, any order. Duplicate dates keep the last entry. */
  bars: { date: string; close: number }[];
  /** Index members matched to our instruments, out of all current members. */
  components?: { matched: number; total: number };
  /** Percent values 0-100. `coveragePct` is the share of members with data. */
  breadth?: { date: string; aboveMa50Pct: number; aboveMa200Pct: number; coveragePct: number };
  /** Percent values 0-100. */
  earnings?: { date: string; positiveGrowthPct: number; acceleratingPct: number; coveragePct: number };
  /** No valuation history is stored yet; always not assessed. */
  valuation?: null;
  /** Percent values 0-100 of scored members in each stored state. */
  scoreDistribution?: { date: string; setupMetPct: number; criteriaBrokenPct: number; coveragePct: number };
  isVolatilityIndex: boolean;
}

export const INDEX_RATING_VERSION = "index-v1-2026-11-13";

export type IndexRatingFactorId = "trend" | "breadth" | "valuation" | "earnings" | "volatility" | "distribution";

export const INDEX_RATING_WEIGHTS: Readonly<Record<IndexRatingFactorId, number>> = {
  trend: 25,
  breadth: 20,
  valuation: 15,
  earnings: 15,
  volatility: 15,
  distribution: 10,
};

const FACTOR_ORDER: readonly IndexRatingFactorId[] = ["trend", "breadth", "valuation", "earnings", "volatility", "distribution"];

export type IndexRatingBand = "broad-strength" | "constructive" | "mixed" | "weakening" | "broad-weakness";

/** Lower bound of each band, highest first. Anything below 25 is broad weakness. */
export const INDEX_RATING_BANDS: readonly { band: IndexRatingBand; min: number }[] = [
  { band: "broad-strength", min: 80 },
  { band: "constructive", min: 65 },
  { band: "mixed", min: 45 },
  { band: "weakening", min: 25 },
  { band: "broad-weakness", min: 0 },
];

/** The full basis needs Trend, two more factors and this share of the 100 points. */
export const MIN_ASSESSED_WEIGHT_PCT = 60;
/** Member-based factors need data for at least this share of members. */
export const MIN_MEMBER_COVERAGE_PCT = 70;
/** The newest usable bar must be at most this many calendar days before asOf. */
export const MAX_BAR_AGE_DAYS = 7;
/** Member aggregates must be dated and recent enough to describe the as-of conditions. */
export const MAX_MEMBER_AGE_DAYS = 7;
/** Permit weekends and market holidays, but exclude gaps and sparse histories. */
export const MAX_BAR_GAP_DAYS = 7;
export const MAX_CALENDAR_DAYS_PER_SESSION = 1.5;
export const BAR_SPAN_GRACE_DAYS = 7;

export const TREND_MIN_BARS = 200;
export const VOL_WINDOW = 20;
/** Three years of sessions for the realized-volatility and VIX percentile history. */
export const VOL_HISTORY_SESSIONS = 756;
/** At least one year of rolling volatility values before a percentile is used. */
export const VOL_MIN_HISTORY = 252;
export const DRAWDOWN_WINDOW = 252;
/** One extra close for the first return, then a year of rolling values plus today. */
export const VOLATILITY_MIN_BARS = VOL_WINDOW + 1 + VOL_MIN_HISTORY;
export const VIX_MIN_BARS = VOL_MIN_HISTORY;

export type IndexRatingNote =
  | "no-bars"
  | "stale-bars"
  | "sparse-bars"
  | "insufficient-bars"
  | "no-data"
  | "undated-data"
  | "stale-data"
  | "invalid-data"
  | "coverage-below-minimum"
  | "no-valuation-history"
  | "volatility-index"
  /** Assessed, but left out because the composite fell back to the price-based basis. */
  | "not-in-composite";

export type IndexRatingSuppression = "trend-not-assessed" | "volatility-not-assessed" | "volatility-index";

/**
 * What the composite is built from.
 * - `full`: Trend, at least two other factors and at least 60% of the weight.
 * - `price-only`: the full guard is not met, so only Trend and Volatility and drawdown (40 points) count.
 */
export type IndexRatingBasis = "full" | "price-only";

/** Text for the basis flag, for pages and exports. Neutral wording under ADR-001. */
export const INDEX_RATING_BASIS_TEXT: Readonly<Record<IndexRatingBasis, { en: { label: string; description: string }; sk: { label: string; description: string } }>> = {
  full: {
    en: { label: "Price and member data", description: "The score uses the index price and data on its members." },
    sk: { label: "Cena a údaje o členoch", description: "Skóre vychádza z ceny indexu aj z údajov o jeho členoch." },
  },
  "price-only": {
    en: { label: "Price-based only", description: "The score uses only the trend, volatility and drawdown of the index price. Member breadth, earnings and score data are not included." },
    sk: { label: "Iba podľa ceny", description: "Skóre vychádza iba z trendu, volatility a poklesu ceny indexu. Údaje o členoch indexu (šírka trhu, zisky, skóre) nie sú zahrnuté." },
  },
};

const PRICE_FACTORS: readonly IndexRatingFactorId[] = ["trend", "volatility"];

export interface IndexRatingFactor {
  id: IndexRatingFactorId;
  assessed: boolean;
  /** Points earned, rounded to two decimals; null when not assessed. */
  points: number | null;
  max: number;
  /** Headline measured value for the factor (see docs/index-rating.md); null when unavailable. */
  value: number | null;
  /** Plain description of the rule applied. */
  threshold: string;
  /** Date of the evidence: the last bar used, or the member input's source date. */
  date: string | null;
  notes: IndexRatingNote[];
  /** Individual measured inputs behind the points. */
  inputs: Record<string, number | null>;
}

export type VolatilityRegimeLabel = "low" | "normal" | "elevated" | "high";

export interface VolatilityRegime {
  assessed: boolean;
  label: VolatilityRegimeLabel | null;
  close: number | null;
  /** Share (0-100) of the prior history with a lower close. */
  percentile: number | null;
  historySessions: number;
  date: string | null;
  notes: IndexRatingNote[];
}

export interface IndexRatingResult {
  version: string;
  symbol: string;
  asOf: string;
  kind: "equity" | "volatility";
  status: "rated" | "not-enough-data" | "volatility-context";
  /** Composite basis; null when no composite is given. */
  basis: IndexRatingBasis | null;
  basisText: (typeof INDEX_RATING_BASIS_TEXT)[IndexRatingBasis] | null;
  /** 0-100, null when suppressed. */
  score: number | null;
  band: IndexRatingBand | null;
  /** Weight of the factors in the composite (or all assessed factors when suppressed), as a percent of 100. */
  coveragePct: number;
  assessedWeight: number;
  /** Points earned by the factors in the composite (or all assessed factors when suppressed). */
  earned: number;
  suppressedBy: IndexRatingSuppression[];
  /** Matched members as a percent of all members, when known. */
  componentsMatchedPct: number | null;
  factors: IndexRatingFactor[];
  volatilityRegime: VolatilityRegime | null;
}

// ---------- pure helpers ----------

type Bar = { date: string; close: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !ISO_DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPct(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** Valid bars on or before asOf, ascending by date, one bar per date. */
export function cleanBars(bars: readonly Bar[], asOf: string): Bar[] {
  if (!isValidDate(asOf)) throw new RangeError("asOf must be a valid ISO date (YYYY-MM-DD)");
  const byDate = new Map<string, number>();
  for (const bar of bars) {
    if (!isValidDate(bar.date) || bar.date > asOf) continue;
    if (!Number.isFinite(bar.close) || bar.close <= 0) continue;
    byDate.set(bar.date, bar.close);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, close]) => ({ date, close }));
}

/** Simple moving average of the `period` closes ending `offset` sessions before the last. */
export function sma(closes: readonly number[], period: number, offset = 0): number | null {
  if (period <= 0 || offset < 0 || closes.length < period + offset) return null;
  const end = closes.length - offset;
  let sum = 0;
  for (let i = end - period; i < end; i++) sum += closes[i];
  return sum / period;
}

/** Annualized realized volatility of the `window` log returns ending at `end` (exclusive), sample stdev. */
export function realizedVol(closes: readonly number[], window = VOL_WINDOW, end = closes.length): number | null {
  if (window < 2 || end > closes.length || end - window - 1 < 0) return null;
  const returns: number[] = [];
  for (let i = end - window; i < end; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Decline of the last close from the highest close in the last `window` sessions, as a fraction 0-1. */
export function drawdownFromHigh(closes: readonly number[], window = DRAWDOWN_WINDOW): number | null {
  if (closes.length === 0) return null;
  const recent = closes.slice(-window);
  const high = Math.max(...recent);
  return (high - closes[closes.length - 1]) / high;
}

/** Share (0-1) of `history` strictly below `value`. */
export function percentileBelow(value: number, history: readonly number[]): number | null {
  if (history.length === 0) return null;
  return history.filter((h) => h < value).length / history.length;
}

/** Linear ramp: 0 at or below `from`, `max` at or above `to`. */
function ramp(value: number, from: number, to: number, max: number): number {
  return clamp((value - from) / (to - from), 0, 1) * max;
}

/** 0 at 0%, half at 50%, full at 80% and above, linear in between. */
function earningsRamp(pct: number, max: number): number {
  if (pct <= 50) return (clamp(pct, 0, 50) / 50) * (max / 2);
  return max / 2 + ramp(pct, 50, 80, max / 2);
}

export function bandFor(score: number): IndexRatingBand {
  for (const { band, min } of INDEX_RATING_BANDS) if (score >= min) return band;
  return "broad-weakness";
}

// ---------- factor scorers (exported for tests) ----------

export function trendPoints(t: { close: number; ma50: number; ma200: number; ma50Slope: number }): { points: number; met: number } {
  const checks: [boolean, number][] = [
    [t.close > t.ma50, 6],
    [t.close > t.ma200, 6],
    [t.ma50 > t.ma200, 6],
    [t.ma50Slope > 0, 7],
  ];
  const result = checks.reduce((acc, [ok, pts]) => (ok ? { points: acc.points + pts, met: acc.met + 1 } : acc), { points: 0, met: 0 });
  return { points: result.met < 2 ? 0 : result.met === 2 ? 12 : result.points, met: result.met };
}

export function breadthPoints(aboveMa50Pct: number, aboveMa200Pct: number): number {
  return ramp(aboveMa50Pct, 20, 80, 10) + ramp(aboveMa200Pct, 20, 80, 10);
}

export function earningsPoints(positiveGrowthPct: number, acceleratingPct: number): number {
  return earningsRamp(positiveGrowthPct, 10) + earningsRamp(acceleratingPct, 5);
}

/** `volPercentile` is 0-1; `drawdown` is a fraction 0-1. */
export function volatilityPoints(volPercentile: number, drawdown: number): { volPts: number; drawdownPts: number } {
  const volPts = 10 * (1 - clamp(volPercentile, 0, 1));
  const drawdownPts = drawdown < 0.05 ? 5 : drawdown <= 0.1 ? 3 : 0;
  return { volPts, drawdownPts };
}

export function distributionPoints(setupMetPct: number, criteriaBrokenPct: number): number {
  return clamp(5 + ramp(setupMetPct, 0, 20, 5) - ramp(criteriaBrokenPct, 0, 50, 5), 0, 10);
}

export function volatilityRegimeLabel(percentile: number): VolatilityRegimeLabel {
  if (percentile < 25) return "low";
  if (percentile < 75) return "normal";
  if (percentile < 90) return "elevated";
  return "high";
}

// ---------- factor builders ----------

const THRESHOLDS: Record<IndexRatingFactorId, string> = {
  trend: "Close above MA50 (6), close above MA200 (6), MA50 above MA200 (6), MA50 higher than 50 sessions earlier (7); 0 below two conditions, 12 for two; needs 200 dense bars",
  breadth: "Members above MA50 and above MA200: each 0 points at 20% or less, 10 at 80% or more, linear between; needs 70% member coverage",
  valuation: "Valuation against the index's own five-year history; not assessed until valuation history is stored",
  earnings: "Members with positive growth (10) and accelerating growth (5): 0 at 0%, half at 50%, full at 80%; needs 70% member coverage",
  volatility: "20-session realized volatility percentile against up to 3 years (10 x (1 - percentile)); drawdown from 252-session high under 5% (5), 5-10% (3), over 10% (0); needs 273 dense bars",
  distribution: "5 plus 0-5 for Setup met share (full at 20%) minus 0-5 for Criteria broken share (full at 50%); needs 70% scored coverage",
};

function emptyFactor(id: IndexRatingFactorId, notes: IndexRatingNote[], date: string | null = null, inputs: Record<string, number | null> = {}): IndexRatingFactor {
  return { id, assessed: false, points: null, max: INDEX_RATING_WEIGHTS[id], value: null, threshold: THRESHOLDS[id], date, notes, inputs };
}

function assessedFactor(id: IndexRatingFactorId, points: number, value: number | null, date: string | null, inputs: Record<string, number | null>): IndexRatingFactor {
  return { id, assessed: true, points: round2(points), max: INDEX_RATING_WEIGHTS[id], value, threshold: THRESHOLDS[id], date, notes: [], inputs };
}

interface BarState {
  bars: Bar[];
  closes: number[];
  lastDate: string | null;
  /** Shared reason the bar-based factors cannot be assessed, if any. */
  blocked: IndexRatingNote | null;
  sparse: boolean;
}

/** Retain the latest run with no large gaps or excessive calendar span. */
function denseSuffix(bars: Bar[]): Bar[] {
  let start = bars.length - 1;
  while (start > 0) {
    const gap = dayNumber(bars[start].date) - dayNumber(bars[start - 1].date);
    const count = bars.length - start + 1;
    const span = dayNumber(bars.at(-1)!.date) - dayNumber(bars[start - 1].date);
    const localSpan = count >= VOL_WINDOW ? dayNumber(bars[start + VOL_WINDOW - 2].date) - dayNumber(bars[start - 1].date) : 0;
    if (gap > MAX_BAR_GAP_DAYS || span > MAX_CALENDAR_DAYS_PER_SESSION * (count - 1) + BAR_SPAN_GRACE_DAYS ||
      (count >= VOL_WINDOW && localSpan > MAX_CALENDAR_DAYS_PER_SESSION * (VOL_WINDOW - 1) + BAR_SPAN_GRACE_DAYS)) break;
    start--;
  }
  return bars.slice(start);
}

function barState(inputs: IndexRatingInputs): BarState {
  const allBars = cleanBars(inputs.bars ?? [], inputs.asOf);
  const bars = denseSuffix(allBars);
  const closes = bars.map((b) => b.close);
  const lastDate = bars.at(-1)?.date ?? null;
  let blocked: IndexRatingNote | null = null;
  if (lastDate === null) blocked = "no-bars";
  else if (dayNumber(inputs.asOf) - dayNumber(lastDate) > MAX_BAR_AGE_DAYS) blocked = "stale-bars";
  return { bars, closes, lastDate, blocked, sparse: bars.length < allBars.length };
}

function trendFactor(s: BarState): IndexRatingFactor {
  if (s.blocked) return emptyFactor("trend", [s.blocked], s.lastDate);
  if (s.closes.length < TREND_MIN_BARS) return emptyFactor("trend", [s.sparse ? "sparse-bars" : "insufficient-bars"], s.lastDate, { bars: s.closes.length });
  const close = s.closes[s.closes.length - 1];
  const ma50 = sma(s.closes, 50)!;
  const ma200 = sma(s.closes, 200)!;
  const ma50Prior = sma(s.closes, 50, 50)!;
  const ma50Slope = ma50 - ma50Prior;
  const { points, met } = trendPoints({ close, ma50, ma200, ma50Slope });
  return assessedFactor("trend", points, met, s.lastDate, { close, ma50, ma200, ma50Prior, ma50Slope, conditionsMet: met });
}

function volatilityFactor(s: BarState): IndexRatingFactor {
  if (s.blocked) return emptyFactor("volatility", [s.blocked], s.lastDate);
  if (s.closes.length < VOLATILITY_MIN_BARS) return emptyFactor("volatility", [s.sparse ? "sparse-bars" : "insufficient-bars"], s.lastDate, { bars: s.closes.length });
  const n = s.closes.length;
  const current = realizedVol(s.closes, VOL_WINDOW, n)!;
  // Prior rolling values only: windows ending before today, up to three years back.
  const history: number[] = [];
  const firstEnd = Math.max(VOL_WINDOW + 1, n - VOL_HISTORY_SESSIONS);
  for (let end = firstEnd; end < n; end++) history.push(realizedVol(s.closes, VOL_WINDOW, end)!);
  const percentile = percentileBelow(current, history)!;
  const drawdown = drawdownFromHigh(s.closes, DRAWDOWN_WINDOW)!;
  const { volPts, drawdownPts } = volatilityPoints(percentile, drawdown);
  return assessedFactor("volatility", volPts + drawdownPts, round2(current * 100), s.lastDate, {
    realizedVolPct: round2(current * 100),
    volPercentile: round2(percentile * 100),
    historySessions: history.length,
    drawdownPct: round2(drawdown * 100),
    volPoints: round2(volPts),
    drawdownPoints: drawdownPts,
  });
}

function memberFactor<T extends { date: string; coveragePct: number }>(
  id: IndexRatingFactorId,
  data: T | undefined | null,
  asOf: string,
  fields: (keyof T & string)[],
  score: (d: T) => { points: number; value: number },
): IndexRatingFactor {
  if (!data) return emptyFactor(id, ["no-data"]);
  const inputs: Record<string, number | null> = { coveragePct: isPct(data.coveragePct) ? data.coveragePct : null };
  for (const f of fields) inputs[f] = isPct(data[f]) ? (data[f] as number) : null;
  if (!data.date) return emptyFactor(id, ["undated-data"], null, inputs);
  if (!isValidDate(data.date) || data.date > asOf) return emptyFactor(id, ["invalid-data"], null, inputs);
  if (Object.values(inputs).some((v) => v === null)) return emptyFactor(id, ["invalid-data"], data.date, inputs);
  if (dayNumber(asOf) - dayNumber(data.date) > MAX_MEMBER_AGE_DAYS) return emptyFactor(id, ["stale-data"], data.date, inputs);
  if (data.coveragePct < MIN_MEMBER_COVERAGE_PCT) return emptyFactor(id, ["coverage-below-minimum"], data.date, inputs);
  const { points, value } = score(data);
  return assessedFactor(id, points, value, data.date, inputs);
}

function volatilityRegime(s: BarState): VolatilityRegime {
  const base = { assessed: false, label: null, close: null, percentile: null, historySessions: 0, date: s.lastDate };
  if (s.blocked) return { ...base, notes: [s.blocked] };
  if (s.closes.length < VIX_MIN_BARS + 1) return { ...base, notes: [s.sparse ? "sparse-bars" : "insufficient-bars"], historySessions: Math.max(0, s.closes.length - 1) };
  const close = s.closes[s.closes.length - 1];
  const history = s.closes.slice(Math.max(0, s.closes.length - 1 - VOL_HISTORY_SESSIONS), -1);
  const percentile = round2(percentileBelow(close, history)! * 100);
  return { assessed: true, label: volatilityRegimeLabel(percentile), close, percentile, historySessions: history.length, date: s.lastDate, notes: [] };
}

// ---------- entry point ----------

export function rateIndex(inputs: IndexRatingInputs): IndexRatingResult {
  const s = barState(inputs);
  const componentsMatchedPct = inputs.components && inputs.components.total > 0 ? round2((inputs.components.matched / inputs.components.total) * 100) : null;
  const header = { version: INDEX_RATING_VERSION, symbol: inputs.symbol, asOf: inputs.asOf, componentsMatchedPct };

  if (inputs.isVolatilityIndex) {
    return {
      ...header,
      kind: "volatility",
      status: "volatility-context",
      basis: null,
      basisText: null,
      score: null,
      band: null,
      coveragePct: 0,
      assessedWeight: 0,
      earned: 0,
      suppressedBy: ["volatility-index"],
      factors: FACTOR_ORDER.map((id) => emptyFactor(id, ["volatility-index"])),
      volatilityRegime: volatilityRegime(s),
    };
  }

  const byId: Record<IndexRatingFactorId, IndexRatingFactor> = {
    trend: trendFactor(s),
    breadth: memberFactor("breadth", inputs.breadth, inputs.asOf, ["aboveMa50Pct", "aboveMa200Pct"], (d) => ({
      points: breadthPoints(d.aboveMa50Pct, d.aboveMa200Pct),
      value: round2((d.aboveMa50Pct + d.aboveMa200Pct) / 2),
    })),
    valuation: emptyFactor("valuation", ["no-valuation-history"]),
    earnings: memberFactor("earnings", inputs.earnings, inputs.asOf, ["positiveGrowthPct", "acceleratingPct"], (d) => ({
      points: earningsPoints(d.positiveGrowthPct, d.acceleratingPct),
      value: d.positiveGrowthPct,
    })),
    volatility: volatilityFactor(s),
    distribution: memberFactor("distribution", inputs.scoreDistribution, inputs.asOf, ["setupMetPct", "criteriaBrokenPct"], (d) => ({
      points: distributionPoints(d.setupMetPct, d.criteriaBrokenPct),
      value: round2(d.setupMetPct - d.criteriaBrokenPct),
    })),
  };
  const factors = FACTOR_ORDER.map((id) => byId[id]);
  const assessed = factors.filter((f) => f.assessed);
  const weightOf = (list: IndexRatingFactor[]) => list.reduce((sum, f) => sum + f.max, 0);
  const fullGuard = byId.trend.assessed && assessed.filter((f) => f.id !== "trend").length >= 2 && weightOf(assessed) >= MIN_ASSESSED_WEIGHT_PCT;
  const priceGuard = byId.trend.assessed && byId.volatility.assessed;
  const basis: IndexRatingBasis | null = fullGuard ? "full" : priceGuard ? "price-only" : null;

  const suppressedBy: IndexRatingSuppression[] = [];
  if (!byId.trend.assessed) suppressedBy.push("trend-not-assessed");
  if (basis === null && !byId.volatility.assessed) suppressedBy.push("volatility-not-assessed");

  const used = basis === "price-only" ? assessed.filter((f) => PRICE_FACTORS.includes(f.id)) : assessed;
  if (basis === "price-only") for (const f of assessed) if (!PRICE_FACTORS.includes(f.id)) f.notes.push("not-in-composite");
  const assessedWeight = weightOf(used);
  const earnedRaw = used.reduce((sum, f) => sum + (f.points ?? 0), 0);
  const score = basis !== null && assessedWeight > 0 ? Math.round((earnedRaw / assessedWeight) * 100) : null;
  return {
    ...header,
    kind: "equity",
    status: score === null ? "not-enough-data" : "rated",
    basis,
    basisText: basis === null ? null : INDEX_RATING_BASIS_TEXT[basis],
    score,
    band: score === null ? null : bandFor(score),
    coveragePct: round2((assessedWeight / 100) * 100),
    assessedWeight,
    earned: round2(earnedRaw),
    suppressedBy,
    factors,
    volatilityRegime: null,
  };
}
