/**
 * Chart context computed from stored daily bars, so the judge reads numbers and never raw bars.
 * Pure and deterministic: the same bars always give the same output. Every number is rounded to two decimals.
 * The Twelve Data free plan allows internal use only, so only derived values leave this module, never the price series.
 */
export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }
export type Regime = "uptrend" | "pullback" | "deep_pullback" | "range" | "downtrend";
export interface Technicals {
  date: string;
  close: number;
  return1dPercent: number | null;
  return5dPercent: number | null;
  return20dPercent: number | null;
  return60dPercent: number | null;
  /** Close against each simple moving average, in percent. Positive means above. */
  vsMa20Percent: number | null;
  vsMa50Percent: number | null;
  vsMa200Percent: number | null;
  /** How far under the 20-day high the close sits, in percent. */
  belowHigh20Percent: number | null;
  /** Position inside the 52-week range: percent under the high, percent over the low, and 0 to 100 within the range. */
  belowHigh52wPercent: number | null;
  aboveLow52wPercent: number | null;
  rangePosition52w: number | null;
  rsi14: number | null;
  avgVolume20: number | null;
  /** Latest volume divided by the average of the 20 sessions before it. */
  volumeRatio: number | null;
  atrPercent14: number | null;
  /** Return minus SPY return over the same sessions, in percentage points. Null without SPY bars. */
  relativeStrength20: number | null;
  relativeStrength60: number | null;
  regime: Regime;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r2((a / b - 1) * 100) : null);
const sma = (xs: number[], n: number) => (xs.length >= n ? xs.slice(-n).reduce((s, x) => s + x, 0) / n : null);

export function ret(closes: number[], n: number): number | null {
  return closes.length > n ? pct(closes.at(-1)!, closes.at(-1 - n)!) : null;
}

/** Wilder's RSI over the whole series. */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= n; loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return r2(loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
}

/** Wilder's average true range as a percent of the last close. */
export function atrPercent(bars: Bar[], n = 14): number | null {
  if (bars.length <= n) return null;
  const tr = bars.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close)));
  let atr = tr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < tr.length; i++) atr = (atr * (n - 1) + tr[i]) / n;
  return r2((atr / bars.at(-1)!.close) * 100);
}

/** Regime label. Uptrend: MA50 above MA200 and the close above both. Pullback: uptrend structure with the close 5 to 10 percent under the 20-day high. Deep pullback: more than 10 percent under it but still above the MA200. Downtrend: the close under the MA200 or MA50 under MA200 with the close under the MA50. */
export function regimeOf(close: number, ma50: number | null, ma200: number | null, below20: number | null): Regime {
  if (ma50 === null || ma200 === null) return "range";
  const structure = ma50 > ma200 && close > ma200;
  if (structure && below20 !== null && below20 > 10) return "deep_pullback";
  if (structure && below20 !== null && below20 >= 5) return "pullback";
  if (structure && close > ma50) return "uptrend";
  if (close < ma200 || (ma50 < ma200 && close < ma50)) return "downtrend";
  return "range";
}

/** Returns null when there are fewer than 200 bars, because the rules need the MA200. Bars must be sorted by date. */
export function computeTechnicals(bars: Bar[], spy: Bar[] | null = null): Technicals | null {
  if (bars.length < 200) return null;
  const closes = bars.map((b) => b.close);
  const last = bars.at(-1)!;
  const close = last.close;
  const ma20 = sma(closes, 20), ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  const high20 = Math.max(...bars.slice(-20).map((b) => b.high));
  const year = bars.slice(-252);
  const high52 = Math.max(...year.map((b) => b.high)), low52 = Math.min(...year.map((b) => b.low));
  const prior20 = bars.slice(-21, -1);
  const avgPrior = prior20.length === 20 ? prior20.reduce((s, b) => s + b.volume, 0) / 20 : null;
  const avg20 = bars.length >= 20 ? bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20 : null;
  const below20 = high20 > 0 ? r2((1 - close / high20) * 100) : null;
  const spyCloses = spy && spy.length > 60 ? spy.map((b) => b.close) : null;
  const rs = (n: number) => { const a = ret(closes, n), b = spyCloses ? ret(spyCloses, n) : null; return a !== null && b !== null ? r2(a - b) : null; };
  return {
    date: last.date, close: r2(close),
    return1dPercent: ret(closes, 1), return5dPercent: ret(closes, 5), return20dPercent: ret(closes, 20), return60dPercent: ret(closes, 60),
    vsMa20Percent: ma20 === null ? null : pct(close, ma20), vsMa50Percent: ma50 === null ? null : pct(close, ma50), vsMa200Percent: ma200 === null ? null : pct(close, ma200),
    belowHigh20Percent: below20,
    belowHigh52wPercent: high52 > 0 ? r2((1 - close / high52) * 100) : null,
    aboveLow52wPercent: low52 > 0 ? r2((close / low52 - 1) * 100) : null,
    rangePosition52w: high52 > low52 ? r2(((close - low52) / (high52 - low52)) * 100) : null,
    rsi14: rsi(closes), avgVolume20: avg20 === null ? null : Math.round(avg20),
    volumeRatio: avgPrior && avgPrior > 0 ? r2(last.volume / avgPrior) : null,
    atrPercent14: atrPercent(bars),
    relativeStrength20: rs(20), relativeStrength60: rs(60),
    regime: regimeOf(close, ma50, ma200, below20),
  };
}
