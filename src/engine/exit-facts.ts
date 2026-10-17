import type { OHLCV } from "./types";

/**
 * Exit facts (PM3, owner decision 2026-10-17). Three review facts, never a sell signal and never read by score(). The public site
 * may show a neutral statement; the owner view may show the same facts with the cost basis. Parameters are placeholders.
 */
export const EXIT_RULES = { version: "2026-10-17.1", atrDays: 22, atrMultiple: 3, maDays: 50, volumeMultiple: 2, volumeDays: 20, reviewGainPercent: 25 } as const;

export interface ExitFacts {
  /** Trailing level: highest close of the window minus atrMultiple times ATR(atrDays), in price units. */
  trailingLevel: number | null;
  closeBelowTrailing: boolean | null;
  /** Latest close under the 50-day average on at least 2x the 20-session mean volume. */
  maBreak: boolean | null;
  volumeRatio: number | null;
  /** Gain from cost in percent, only when a cost basis is given; null in public use. */
  gainFromCostPercent: number | null;
  reviewMarkReached: boolean | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function exitFacts(bars: readonly OHLCV[], costBasis: number | null = null, peakSince?: string): ExitFacts {
  const R = EXIT_RULES;
  const empty: ExitFacts = { trailingLevel: null, closeBelowTrailing: null, maBreak: null, volumeRatio: null, gainFromCostPercent: null, reviewMarkReached: null };
  if (bars.length < R.maDays + 1) return empty;
  const last = bars[bars.length - 1];
  const window = peakSince ? bars.filter((b) => b.date >= peakSince) : bars.slice(-R.maDays);
  const peak = Math.max(...window.map((b) => b.close));
  const atrBars = bars.slice(-(R.atrDays + 1));
  const trs = atrBars.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - atrBars[i].close), Math.abs(b.low - atrBars[i].close)));
  const atr = trs.reduce((s, v) => s + v, 0) / trs.length;
  const trailingLevel = r2(peak - R.atrMultiple * atr);
  const ma = bars.slice(-R.maDays).reduce((s, b) => s + b.close, 0) / R.maDays;
  const meanVolume = bars.slice(-(R.volumeDays + 1), -1).reduce((s, b) => s + b.volume, 0) / R.volumeDays;
  const volumeRatio = meanVolume > 0 ? r2(last.volume / meanVolume) : null;
  const gain = costBasis !== null && costBasis > 0 ? r2((last.close / costBasis - 1) * 100) : null;
  return {
    trailingLevel, closeBelowTrailing: last.close < trailingLevel,
    maBreak: volumeRatio === null ? null : last.close < ma && volumeRatio >= R.volumeMultiple, volumeRatio,
    gainFromCostPercent: gain, reviewMarkReached: gain === null ? null : gain >= R.reviewGainPercent,
  };
}
