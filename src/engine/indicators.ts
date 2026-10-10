import type { OHLCV } from "./types";

/** Default up/down volume threshold for owner review. */
export const ACCUMULATION_UPDOWN_RATIO = 1.25;

export function volumeAccumulation(bars: OHLCV[]): { matched: boolean | null; ratio: number | null } {
  if (bars.length < 51) return { matched: null, ratio: null };
  let upVolume = 0;
  let downVolume = 0;
  for (let i = bars.length - 50; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) upVolume += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) downVolume += bars[i].volume;
  }
  const ratio = downVolume === 0 ? (upVolume > 0 ? Infinity : 0) : upVolume / downVolume;
  return { matched: ratio >= ACCUMULATION_UPDOWN_RATIO, ratio };
}

export function movingAverage(bars: OHLCV[], period: number, offset = 0): number | null {
  if (period <= 0 || bars.length < period + offset) return null;
  const end = bars.length - offset;
  return bars.slice(end - period, end).reduce((sum, bar) => sum + bar.close, 0) / period;
}

export function technicalIndicators(bars: OHLCV[]) {
  const sorted = bars;
  const last = sorted.at(-1);
  const ma50 = movingAverage(sorted, 50);
  const ma200 = movingAverage(sorted, 200);
  const ma50TenDaysAgo = movingAverage(sorted, 50, 10);
  const high20 = sorted.length >= 20 ? Math.max(...sorted.slice(-20).map((bar) => bar.high)) : null;
  const drawdown20 = last && high20 ? (high20 - last.close) / high20 : null;
  const recent = sorted.slice(-10);
  const green = recent.filter((bar) => bar.close > bar.open);
  const red = recent.filter((bar) => bar.close < bar.open);
  const greenVolume = green.length ? green.reduce((sum, bar) => sum + bar.volume, 0) / green.length : 0;
  const redVolume = red.length ? red.reduce((sum, bar) => sum + bar.volume, 0) / red.length : 0;
  const volumeOnGreen = green.length >= 2 && red.length >= 2 && [...green, ...red].every((bar) => Number.isFinite(bar.volume) && bar.volume > 0) && greenVolume >= redVolume * 1.2;
  const aboveBoth = last !== undefined && ma50 !== null && ma200 !== null && last.close > ma50 && last.close > ma200;
  const uptrend = last !== undefined && ma50 !== null && ma200 !== null && ma50TenDaysAgo !== null && ma50 > ma200 && last.close > ma50 && ma50 > ma50TenDaysAgo;
  return { close: last?.close ?? null, ma50, ma200, ma50TenDaysAgo, high20, drawdown20, volumeOnGreen, greenVolume, redVolume, aboveBoth, uptrend };
}
