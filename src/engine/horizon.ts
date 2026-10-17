import type { OHLCV } from "./types";
import type { FlagResult } from "./flags";

/**
 * Horizon profile (TASK-099, report only). A descriptive label from stored data: sustained growth, event-driven, mixed, or no data.
 * Nothing here is read by score(), statusView() or the display percentage, and profit or loss is never an input. Every threshold
 * is a placeholder until the owner reviews the first report; the rules carry their own version, like FLAG_THRESHOLDS.
 */
export const HORIZON_RULES = {
  version: "2026-10-17.1",
  /** Sustained growth: YoY at least this in each of the last `quarters` quarters. */
  sustainedYoyPercent: 15,
  quarters: 4,
  /** Sustained growth needs at least this market cap, USD, and 20-day average dollar volume. */
  longMinMarketCapUsd: 20_000_000_000,
  longMinDollarVolumeUsd: 100_000_000,
  /** ATR% (14 days): sustained growth at most this, event-driven at least the other. */
  longMaxAtrPercent: 4,
  eventMinAtrPercent: 5,
  /** Event-driven: market cap under this, USD. */
  eventMaxMarketCapUsd: 5_000_000_000,
  /** Event-driven: 5-session move (percent, absolute) or volume against the 20-session mean. */
  eventMovePercent: 15,
  eventVolumeMultiple: 2.5,
  /** Latest YoY at least this many times the median of the prior quarters marks a one-quarter spike. */
  spikeMultiple: 2,
  minBars: 60,
} as const;

export type HorizonProfile = "sustained" | "event" | "mixed" | "no-data";
export interface QuarterRevenue { periodEnd: string; value: number }
export interface HorizonInput {
  bars: readonly OHLCV[];
  /** Three-month revenue facts, one per period end, any order. */
  revenue: readonly QuarterRevenue[];
  /** Close times shares outstanding, USD, null when no share count is stored. */
  marketCapUsd: number | null;
  flags: readonly FlagResult[];
  /** Guide section 9 tier from instruments.tier: 1, 2 or 3. Only a prior, never decisive. */
  tier: number | null;
}
export interface HorizonResult {
  profile: HorizonProfile;
  /** Short codes for the rules that fired, for the report. */
  reasons: string[];
  values: Record<string, number | string | null>;
}

const DAY = 86_400_000;
const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** YoY growth for the latest `count` quarter ends, newest first. A quarter with no matching year-ago quarter ends the list. */
export function yoySeries(revenue: readonly QuarterRevenue[], count: number): number[] {
  const byEnd = new Map(revenue.filter((q) => finite(q.value)).map((q) => [q.periodEnd, q.value]));
  const ends = [...byEnd.keys()].sort().reverse();
  const out: number[] = [];
  for (const end of ends.slice(0, count)) {
    const prior = ends.find((e) => Math.abs(Date.parse(end) - Date.parse(e) - 365 * DAY) <= 20 * DAY);
    const previous = prior === undefined ? undefined : byEnd.get(prior);
    if (previous === undefined || previous <= 0) break;
    out.push(r1(((byEnd.get(end)! - previous) / previous) * 100));
  }
  return out;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function horizonProfile(input: HorizonInput): HorizonResult {
  const R = HORIZON_RULES;
  const bars = input.bars;
  const yoy = yoySeries(input.revenue, R.quarters);
  if (bars.length < R.minBars || yoy.length < R.quarters || !finite(input.marketCapUsd)) {
    return { profile: "no-data", reasons: [], values: { bars: bars.length, yoyQuarters: yoy.length, marketCapUsd: input.marketCapUsd } };
  }
  const recent = bars.slice(-20);
  const dollarVolume = Math.round(recent.reduce((s, b) => s + b.close * b.volume, 0) / recent.length);
  const trs = bars.slice(-15).slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - bars.slice(-15)[i].close), Math.abs(b.low - bars.slice(-15)[i].close)));
  const last = bars[bars.length - 1];
  const atrPercent = r1((trs.reduce((s, v) => s + v, 0) / trs.length / last.close) * 100);
  const move5 = bars.length > 5 ? r1((last.close / bars[bars.length - 6].close - 1) * 100) : null;
  const meanVolume = bars.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20;
  const volumeRatio = meanVolume > 0 ? r1(last.volume / meanVolume) : null;
  const flagged = input.flags.filter((f) => f.state === "flagged").map((f) => f.id);

  const sustained = yoy.every((v) => v >= R.sustainedYoyPercent);
  const spike = yoy.length > 1 && median(yoy.slice(1)) > 0 && yoy[0] >= R.spikeMultiple * median(yoy.slice(1));
  const longOk = sustained && input.marketCapUsd >= R.longMinMarketCapUsd && dollarVolume >= R.longMinDollarVolumeUsd && atrPercent <= R.longMaxAtrPercent && flagged.length === 0;
  // Structural reasons describe the company; transient ones describe the last weeks. A large steady grower keeps its label through a transient event.
  const structural: string[] = [];
  if (input.marketCapUsd < R.eventMaxMarketCapUsd) structural.push("small_cap");
  if (atrPercent >= R.eventMinAtrPercent) structural.push("high_atr");
  if (flagged.length) structural.push(`flags:${flagged.join("+")}`);
  const transient: string[] = [];
  if (spike) transient.push("revenue_spike");
  if (move5 !== null && Math.abs(move5) >= R.eventMovePercent) transient.push("price_move");
  if (volumeRatio !== null && volumeRatio >= R.eventVolumeMultiple) transient.push("volume_spike");
  const eventReasons = [...structural, ...(input.marketCapUsd < R.longMinMarketCapUsd ? transient : [])];

  const values = { yoyLatest: yoy[0], yoyOldest: yoy[yoy.length - 1], marketCapUsd: input.marketCapUsd, dollarVolume, atrPercent, move5, volumeRatio, tier: input.tier };
  if (longOk) return { profile: "sustained", reasons: ["sustained_growth", "large_liquid", "low_atr", "no_flags"], values };
  if (eventReasons.length) return { profile: "event", reasons: eventReasons, values };
  return { profile: "mixed", reasons: sustained ? ["sustained_growth_below_size_or_liquidity"] : ["growth_not_sustained"], values };
}
