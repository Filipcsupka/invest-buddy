import type { Covered, IndexRatingInputs } from "./index-types";

/**
 * Index analytics from stored data: price measures from the index's own daily closes, and constituent measures
 * (breadth, sectors, revenue and earnings growth, our rule-state distribution) from the latest constituent list joined
 * to our instruments. Every constituent figure carries its denominator and date. Nothing here is a forecast or an
 * instruction; the rating engine (index-rating.ts) turns the inputs into a neutral condition band.
 * Display of these figures follows the vendor gate of the page that renders them (canUseVendorData / marketsViewable).
 */

/** Volatility indices: their level is shown as context and never rated like an equity market. */
export const VOLATILITY_INDICES: ReadonlySet<string> = new Set(["VIX.INDX", "VXN.INDX", "VXD.INDX", "V2TX.INDX", "VSTOXX.INDX"]);
export const isVolatilityIndex = (symbol: string): boolean => VOLATILITY_INDICES.has(symbol.toUpperCase());

/** Sessions per period, the usual trading-day counts. */
export const SESSIONS = { d1: 1, d5: 5, m1: 21, m3: 63, y1: 252, y3: 756 } as const;
/** Constituent bars or scores older than this many days before the index date are not counted. */
export const MAX_COMPONENT_AGE_DAYS = 10;
const DAY = 86_400_000;

export interface IndexBar { date: string; close: number; high?: number | null; low?: number | null }

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const pct = (part: number, whole: number) => whole > 0 ? (part / whole) * 100 : 0;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;

/** Simple moving average of the last `n` closes ending at `end` (exclusive index), or null without `n` closes. */
export function sma(closes: readonly number[], n: number, end = closes.length): number | null {
  if (n < 1 || end < n || end > closes.length) return null;
  let sum = 0;
  for (let i = end - n; i < end; i++) sum += closes[i];
  return sum / n;
}

/** Ratio change of the last close against the close `n` sessions earlier. */
export function sessionReturn(closes: readonly number[], n: number): number | null {
  if (closes.length <= n) return null;
  const from = closes[closes.length - 1 - n], last = closes[closes.length - 1];
  return from > 0 ? last / from - 1 : null;
}

/** Annualized realized volatility from the daily log returns of the last `n` sessions ending at `end` (exclusive). */
export function realizedVol(closes: readonly number[], n = 20, end = closes.length): number | null {
  if (end - n - 1 < 0 || end > closes.length) return null;
  const returns: number[] = [];
  for (let i = end - n; i < end; i++) {
    const prev = closes[i - 1], cur = closes[i];
    if (!(prev > 0) || !(cur > 0)) return null;
    returns.push(Math.log(cur / prev));
  }
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Percent of `history` values at or below `value` (0..100), or null with fewer than `min` values. */
export function percentileRank(value: number, history: readonly number[], min = 60): number | null {
  if (history.length < min) return null;
  return pct(history.filter((h) => h <= value).length, history.length);
}

export interface IndexPriceAnalytics {
  asOf: string | null;
  /** Sessions in the loaded series and the first date. */
  sessions: number; firstDate: string | null;
  last: number | null;
  ma50: number | null; ma200: number | null;
  /** MA50 change over the last 20 sessions, as a ratio. Positive means a rising average. */
  ma50Slope20: number | null;
  /** Close relative to each average, as a ratio (0.02 is 2% above). */
  distanceMa50: number | null; distanceMa200: number | null;
  returns: { d1: number | null; d5: number | null; m1: number | null; m3: number | null; ytd: number | null; y1: number | null };
  /** 52-week range from highs and lows when stored, otherwise closes. */
  range52w: { high: number | null; low: number | null; positionPct: number | null };
  /** Decline from the highest close in the loaded series (up to five years) and from the 52-week high close, as ratios (0 or negative). */
  drawdownFromHigh: number | null; drawdownFrom52wHigh: number | null; highDate: string | null;
  /** Annualized 20-session realized volatility and its percentile against the last three years of daily values. */
  vol20: number | null; vol20Percentile3y: number | null; vol20HistoryN: number;
}

/** Price measures from ascending daily bars. */
export function priceAnalytics(bars: readonly IndexBar[]): IndexPriceAnalytics {
  const closes = bars.map((bar) => bar.close);
  const last = closes.at(-1) ?? null;
  const asOf = bars.at(-1)?.date ?? null;
  const ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  const ma50Back = sma(closes, 50, closes.length - 20);
  const ratio = (a: number | null, b: number | null) => finite(a) && finite(b) && b > 0 ? a / b - 1 : null;
  const yearStart = asOf ? `${asOf.slice(0, 4)}-01-01` : null;
  let ytdBase: number | null = null;
  if (yearStart) for (let i = bars.length - 1; i >= 0; i--) if (bars[i].date < yearStart) { ytdBase = bars[i].close; break; }
  const year = bars.slice(-SESSIONS.y1);
  const highs = year.map((bar) => finite(bar.high) ? bar.high : bar.close), lows = year.map((bar) => finite(bar.low) ? bar.low : bar.close);
  const high52 = year.length ? Math.max(...highs) : null, low52 = year.length ? Math.min(...lows) : null;
  let peak = -Infinity, peakDate: string | null = null;
  for (const bar of bars) if (bar.close >= peak) { peak = bar.close; peakDate = bar.date; }
  const yearPeak = year.length ? Math.max(...year.map((bar) => bar.close)) : null;
  const vol20 = realizedVol(closes, 20);
  const history: number[] = [];
  for (let end = Math.max(21, closes.length - SESSIONS.y3 + 1); end <= closes.length; end++) {
    const v = realizedVol(closes, 20, end);
    if (v !== null) history.push(v);
  }
  return {
    asOf, sessions: bars.length, firstDate: bars[0]?.date ?? null, last, ma50, ma200,
    ma50Slope20: ratio(ma50, ma50Back), distanceMa50: ratio(last, ma50), distanceMa200: ratio(last, ma200),
    returns: {
      d1: sessionReturn(closes, SESSIONS.d1), d5: sessionReturn(closes, SESSIONS.d5), m1: sessionReturn(closes, SESSIONS.m1),
      m3: sessionReturn(closes, SESSIONS.m3), ytd: ratio(last, ytdBase), y1: sessionReturn(closes, SESSIONS.y1),
    },
    range52w: { high: high52, low: low52, positionPct: finite(last) && finite(high52) && finite(low52) && high52 > low52 ? pct(last - low52, high52 - low52) : null },
    drawdownFromHigh: finite(last) && peak > 0 ? last / peak - 1 : null, drawdownFrom52wHigh: ratio(last, yearPeak), highDate: peakDate,
    vol20, vol20Percentile3y: vol20 === null ? null : percentileRank(vol20, history), vol20HistoryN: history.length,
  };
}

export interface PeerSeries { symbol: string; currency: string | null; bars: readonly IndexBar[] }
export interface RelativeStrength {
  /** Returns compare each index in its own currency; no currency conversion is applied. */
  currencyBasis: "local";
  period: "m3" | "y1";
  value: number | null;
  /** Median return of the other indices with data for the period, and this index's return minus that median. */
  peerMedian: number | null; spread: number | null;
  /** 1 is the strongest of `of` indices with data. */
  rank: number | null; of: number; asOf: string | null;
}

/** Relative strength of `symbol` against the other non-volatility indices, by period return in local currency. */
export function relativeStrength(symbol: string, peers: readonly PeerSeries[], period: "m3" | "y1" = "m3"): RelativeStrength {
  const n = SESSIONS[period];
  const referenceDate = peers.find((peer) => peer.symbol === symbol)?.bars.at(-1)?.date ?? null;
  const rows = peers.filter((peer) => !isVolatilityIndex(peer.symbol))
    .map((peer) => ({ symbol: peer.symbol, value: sessionReturn(peer.bars.map((bar) => bar.close), n), asOf: peer.bars.at(-1)?.date ?? null }))
    .filter((row): row is { symbol: string; value: number; asOf: string } => row.value !== null && row.asOf !== null
      && referenceDate !== null && Math.abs(daysBetween(row.asOf, referenceDate)) <= 7);
  const own = rows.find((row) => row.symbol === symbol);
  const others = rows.filter((row) => row.symbol !== symbol).map((row) => row.value).sort((a, b) => a - b);
  const median = others.length ? (others.length % 2 ? others[(others.length - 1) / 2] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2) : null;
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  return {
    currencyBasis: "local", period, value: own?.value ?? null, peerMedian: median,
    spread: own && median !== null ? own.value - median : null,
    rank: own ? ranked.findIndex((row) => row.symbol === symbol) + 1 : null, of: rows.length, asOf: own?.asOf ?? null,
  };
}

/** One constituent of the latest stored list, joined to our instruments through the security master. */
export interface ComponentFacts {
  code: string; exchange: string | null;
  /** Vendor symbol code.exchange, the key the join uses. */
  vendorSymbol: string | null;
  /** Our instrument ticker, or null when the constituent is not in our instrument list. */
  ticker: string | null;
  name: string | null; sector: string | null; industry: string | null;
  /** Index weight as a fraction when the vendor supplied one. */
  weight: number | null;
  /** Latest stored daily bar of the matched instrument, with MA50 / MA200 over the stored closes (null when fewer bars). */
  barDate?: string | null; close?: number | null; ma50?: number | null; ma200?: number | null;
  /** Latest published rule state of the matched instrument. */
  state?: string | null; stateAsOf?: string | null;
}

export interface Breadth { aboveMa50: Covered<number | null>; aboveMa200: Covered<number | null> }

/** Percent of constituents above their MA50 / MA200, among those with a fresh bar and enough history; `of` is the whole list. */
export function breadth(components: readonly ComponentFacts[], asOf: string | null, maxAgeDays = MAX_COMPONENT_AGE_DAYS): Breadth {
  const fresh = components.filter((c) => finite(c.close) && c.barDate && (!asOf || daysBetween(c.barDate, asOf) <= maxAgeDays));
  const measure = (key: "ma50" | "ma200"): Covered<number | null> => {
    const rows = fresh.filter((c) => finite(c[key]));
    const dates = rows.map((c) => c.barDate as string).sort();
    return { value: rows.length ? round(pct(rows.filter((c) => (c.close as number) > (c[key] as number)).length, rows.length)) : null, n: rows.length, of: components.length, asOf: dates.at(-1) ?? null };
  };
  return { aboveMa50: measure("ma50"), aboveMa200: measure("ma200") };
}

export interface SectorRow { sector: string; count: number; weightPct: number | null }
export interface Sectors {
  rows: SectorRow[];
  /** Constituents with a sector, and constituents with a weight, out of the list. */
  sectorCoverage: Covered<number>; weightCoverage: Covered<number>;
}

/** Constituent counts per sector, and summed weights per sector when every constituent has a weight. */
export function sectors(components: readonly ComponentFacts[], asOf: string | null): Sectors {
  const weighted = components.filter((c) => finite(c.weight));
  const total = weighted.reduce((s, c) => s + (c.weight as number), 0);
  // Published sector weights need a complete constituent list and a plausible index weight total.
  const useWeights = components.length > 0 && weighted.length === components.length && total >= 0.95 && total <= 1.05;
  const groups = new Map<string, { count: number; weight: number }>();
  for (const c of components) {
    if (!c.sector) continue;
    const row = groups.get(c.sector) ?? { count: 0, weight: 0 };
    row.count++; row.weight += c.weight ?? 0;
    groups.set(c.sector, row);
  }
  const rows = [...groups.entries()].map(([sector, row]) => ({ sector, count: row.count, weightPct: useWeights ? round(pct(row.weight, total)) : null }))
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0) || b.count - a.count || a.sector.localeCompare(b.sector));
  const withSector = components.filter((c) => c.sector).length;
  return {
    rows,
    sectorCoverage: { value: round(pct(withSector, components.length)), n: withSector, of: components.length, asOf },
    weightCoverage: { value: round(pct(weighted.length, components.length)), n: weighted.length, of: components.length, asOf },
  };
}

/** One stored point-in-time fact: a revenue or net income value for a quarter or half-year. */
export interface GrowthFact { ticker: string; source: string; concept: string; period: "quarter" | "half"; periodEnd: string; value: number }
export interface ComponentGrowth {
  ticker: string; periodEnd: string;
  /** Year-on-year change as a ratio (null when the year-ago value is not positive) and its direction. */
  revenueYoy: number | null; revenueUp: boolean;
  /** Revenue growth faster than the prior period's year-on-year growth; null when the prior period is not stored. */
  revenueAccelerating: boolean | null;
  /** Net income direction against the same period a year earlier; null when not stored. */
  earningsUp: boolean | null; earningsYoy: number | null;
}

const NET_INCOME = "NetIncomeLoss";

/** Year-on-year change for the latest period of a same-length series, plus the prior period's change. */
function seriesGrowth(points: { periodEnd: string; value: number }[], period: "quarter" | "half") {
  const byEnd = new Map(points.map((p) => [p.periodEnd, p.value]));
  const ends = [...byEnd.keys()].sort();
  const find = (from: string, days: number) => ends.find((e) => Math.abs(daysBetween(e, from) - days) <= 20);
  const yoy = (end: string | undefined) => {
    if (!end) return null;
    const ago = find(end, 365);
    if (!ago) return null;
    const now = byEnd.get(end) as number, then = byEnd.get(ago) as number;
    return { up: now > then, ratio: then > 0 ? now / then - 1 : null };
  };
  const latest = ends.at(-1);
  const current = yoy(latest);
  if (!latest || !current) return null;
  const previous = yoy(find(latest, period === "quarter" ? 91 : 182));
  return { periodEnd: latest, current, previous };
}

/**
 * Growth per constituent from stored filings. For each ticker the revenue series (source, concept and period length)
 * with the latest period that has a year-ago value wins; net income uses the same period end when stored.
 */
export function componentGrowth(facts: readonly GrowthFact[]): Map<string, ComponentGrowth> {
  const byTicker = new Map<string, Map<string, GrowthFact[]>>();
  for (const fact of facts) {
    const series = byTicker.get(fact.ticker) ?? byTicker.set(fact.ticker, new Map()).get(fact.ticker)!;
    const key = `${fact.source}:${fact.concept}:${fact.period}`;
    (series.get(key) ?? series.set(key, []).get(key)!).push(fact);
  }
  const out = new Map<string, ComponentGrowth>();
  for (const [ticker, series] of byTicker) {
    let best: { periodEnd: string; current: { up: boolean; ratio: number | null }; previous: { up: boolean; ratio: number | null } | null; rank: number } | null = null;
    let earnings: ReturnType<typeof seriesGrowth> = null;
    for (const [key, points] of series) {
      const [source, concept, period] = key.split(":") as [string, string, "quarter" | "half"];
      const growth = seriesGrowth(points, period);
      if (!growth) continue;
      if (concept === NET_INCOME) { if (!earnings || growth.periodEnd > earnings.periodEnd) earnings = growth; continue; }
      const rank = (period === "quarter" ? 0 : 2) + (source === "sec" ? 0 : 1);
      if (!best || growth.periodEnd > best.periodEnd || (growth.periodEnd === best.periodEnd && rank < best.rank)) best = { ...growth, rank };
    }
    if (!best) continue;
    const matchingEarnings = earnings && Math.abs(daysBetween(earnings.periodEnd, best.periodEnd)) <= 20 ? earnings : null;
    out.set(ticker, {
      ticker, periodEnd: best.periodEnd, revenueYoy: best.current.ratio, revenueUp: best.current.up,
      revenueAccelerating: best.current.ratio !== null && best.previous?.ratio != null ? best.current.ratio > best.previous.ratio : null,
      earningsUp: matchingEarnings ? matchingEarnings.current.up : null, earningsYoy: matchingEarnings ? matchingEarnings.current.ratio : null,
    });
  }
  return out;
}

export interface EarningsSummary {
  /** Constituents counted as growing: revenue up year on year and, where net income is stored for the period, net income up too. */
  positiveGrowth: Covered<number | null>;
  /** Share of constituents whose revenue growth beat the prior period's; `n` counts those with both periods stored. */
  accelerating: Covered<number | null>;
  revenueUp: Covered<number | null>; earningsUp: Covered<number | null>;
  /** Weighted average year-on-year growth in percent, when every eligible constituent has an index weight. */
  weightedRevenueYoyPct: Covered<number | null>; weightedEarningsYoyPct: Covered<number | null>;
  /** Median revenue growth (ratio) among constituents with a positive year-ago value. */
  medianRevenueYoy: number | null;
  /** True when shares are weighted by index weight (every assessed constituent had one); otherwise each counts once. */
  weighted: boolean;
}

/** Weighted (when weights exist) share of constituents with growing revenue and earnings, each with its denominator. */
export function earningsSummary(components: readonly ComponentFacts[], growth: ReadonlyMap<string, ComponentGrowth>, asOf: string | null = null): EarningsSummary {
  const assessed = components.flatMap((c) => {
    const g = c.ticker ? growth.get(c.ticker) : undefined;
    return g && (!asOf || (daysBetween(g.periodEnd, asOf) >= 0 && daysBetween(g.periodEnd, asOf) <= 550)) ? [{ c, g }] : [];
  });
  const weighted = assessed.length > 0 && assessed.every(({ c }) => finite(c.weight) && (c.weight as number) > 0);
  const w = (c: ComponentFacts) => weighted ? c.weight as number : 1;
  const latest = assessed.map(({ g }) => g.periodEnd).sort().at(-1) ?? null;
  const share = (rows: typeof assessed, hit: (g: ComponentGrowth) => boolean): Covered<number | null> => {
    const total = rows.reduce((s, { c }) => s + w(c), 0);
    return { value: rows.length && total > 0 ? round(pct(rows.filter(({ g }) => hit(g)).reduce((s, { c }) => s + w(c), 0), total)) : null, n: rows.length, of: components.length, asOf: latest };
  };
  const ratios = assessed.map(({ g }) => g.revenueYoy).filter(finite).sort((a, b) => a - b);
  const median = ratios.length ? (ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2) : null;
  const weightedMean = (key: "revenueYoy" | "earningsYoy"): Covered<number | null> => {
    const rows = assessed.filter(({ g }) => finite(g[key]));
    const complete = rows.length > 0 && rows.every(({ c }) => finite(c.weight) && (c.weight as number) > 0);
    const total = complete ? rows.reduce((sum, { c }) => sum + (c.weight as number), 0) : 0;
    return { value: complete && total > 0 ? round(100 * rows.reduce((sum, { c, g }) => sum + (c.weight as number) * (g[key] as number), 0) / total) : null,
      n: rows.length, of: components.length, asOf: rows.map(({ g }) => g.periodEnd).sort().at(-1) ?? null };
  };
  return {
    positiveGrowth: share(assessed.filter(({ g }) => g.earningsUp !== null), (g) => g.revenueUp && g.earningsUp === true),
    accelerating: share(assessed.filter(({ g }) => g.revenueAccelerating !== null), (g) => g.revenueAccelerating === true),
    revenueUp: share(assessed, (g) => g.revenueUp),
    earningsUp: share(assessed.filter(({ g }) => g.earningsUp !== null), (g) => g.earningsUp === true),
    weightedRevenueYoyPct: weightedMean("revenueYoy"), weightedEarningsYoyPct: weightedMean("earningsYoy"),
    medianRevenueYoy: median, weighted,
  };
}

/** Stored rule states as written by scoring (score_results.state). */
export const SETUP_MET = "Setup met (>=18)";
export const CRITERIA_BROKEN = "Criteria broken";
export interface ScoreDistribution {
  setupMet: Covered<number | null>; criteriaBroken: Covered<number | null>;
  /** Count of each stored state among scored constituents. */
  states: Record<string, number>;
  scored: Covered<number>;
}

/** Our latest published rule states across the constituents, counting only states no older than `maxAgeDays` before `asOf`. */
export function scoreDistribution(components: readonly ComponentFacts[], asOf: string | null, maxAgeDays = MAX_COMPONENT_AGE_DAYS): ScoreDistribution {
  const scored = components.filter((c) => c.state && c.stateAsOf && (!asOf || daysBetween(c.stateAsOf, asOf) <= maxAgeDays));
  const latest = scored.map((c) => c.stateAsOf as string).sort().at(-1) ?? null;
  const states: Record<string, number> = {};
  for (const c of scored) states[c.state as string] = (states[c.state as string] ?? 0) + 1;
  const share = (state: string): Covered<number | null> => ({ value: scored.length ? round(pct(states[state] ?? 0, scored.length)) : null, n: scored.length, of: components.length, asOf: latest });
  return {
    setupMet: share(SETUP_MET), criteriaBroken: share(CRITERIA_BROKEN), states,
    scored: { value: round(pct(scored.length, components.length)), n: scored.length, of: components.length, asOf: latest },
  };
}

/** Level, changes and percentile of a volatility index: context only, never a condition rating. */
export interface VolatilityContext {
  symbol: string; asOf: string | null; level: number | null;
  change5d: number | null; change1m: number | null;
  /** Percentile of the latest close against the daily closes of the last three years. */
  levelPercentile3y: number | null; historyN: number;
}

export function volatilityContext(symbol: string, bars: readonly IndexBar[]): VolatilityContext {
  const closes = bars.map((bar) => bar.close);
  const history = closes.slice(-SESSIONS.y3);
  const level = closes.at(-1) ?? null;
  return {
    symbol, asOf: bars.at(-1)?.date ?? null, level, change5d: sessionReturn(closes, SESSIONS.d5), change1m: sessionReturn(closes, SESSIONS.m1),
    levelPercentile3y: level === null ? null : percentileRank(level, history), historyN: history.length,
  };
}

export interface IndexAnalyticsSource {
  symbol: string;
  bars: readonly IndexBar[];
  /** Date of the constituent list, or null when none is stored. */
  componentsAsOf: string | null;
  components: readonly ComponentFacts[];
  growthFacts: readonly GrowthFact[];
  peers?: readonly PeerSeries[];
}

export interface IndexAnalytics {
  symbol: string; asOf: string | null; isVolatilityIndex: boolean;
  price: IndexPriceAnalytics;
  relativeStrength: { m3: RelativeStrength; y1: RelativeStrength } | null;
  /** Constituents matched to our instruments, out of the latest list. */
  matched: Covered<number> | null;
  breadth: Breadth | null; sectors: Sectors | null; earnings: EarningsSummary | null; scores: ScoreDistribution | null;
  volatility: VolatilityContext | null;
}

/** All index analytics from one read. Volatility indices get price measures and volatility context only. */
export function indexAnalytics(source: IndexAnalyticsSource): IndexAnalytics {
  const vol = isVolatilityIndex(source.symbol);
  const price = priceAnalytics(source.bars);
  const components = vol ? [] : source.components;
  const hasList = components.length > 0;
  const matchedCount = components.filter((c) => c.ticker).length;
  const asOf = [price.asOf, hasList ? source.componentsAsOf : null].filter((date): date is string => date !== null).sort().at(-1) ?? null;
  return {
    symbol: source.symbol, asOf, isVolatilityIndex: vol, price,
    relativeStrength: !vol && source.peers?.length ? { m3: relativeStrength(source.symbol, source.peers, "m3"), y1: relativeStrength(source.symbol, source.peers, "y1") } : null,
    matched: hasList ? { value: round(pct(matchedCount, components.length)), n: matchedCount, of: components.length, asOf: source.componentsAsOf } : null,
    breadth: hasList ? breadth(components, asOf) : null,
    sectors: hasList ? sectors(components, source.componentsAsOf) : null,
    earnings: hasList ? earningsSummary(components, componentGrowth(source.growthFacts), asOf) : null,
    scores: hasList ? scoreDistribution(components, asOf) : null,
    volatility: vol ? volatilityContext(source.symbol, source.bars) : null,
  };
}

const coverage = (covered: Covered<unknown>) => round(pct(covered.n, covered.of));

/**
 * The rating engine's input shape. A constituent block is present only when at least one constituent had data for it;
 * volatility indices carry bars only.
 */
export function toRatingInputs(analytics: IndexAnalytics, bars: readonly IndexBar[]): IndexRatingInputs {
  if (!analytics.asOf) throw new Error("Index rating inputs require a dated index bar");
  const out: IndexRatingInputs = {
    symbol: analytics.symbol, asOf: analytics.asOf, bars: bars.map((bar) => ({ date: bar.date, close: bar.close })),
    valuation: null, isVolatilityIndex: analytics.isVolatilityIndex,
  };
  if (analytics.isVolatilityIndex) return out;
  if (analytics.matched) out.components = { matched: analytics.matched.n, total: analytics.matched.of };
  const b = analytics.breadth;
  if (b && b.aboveMa50.value !== null && b.aboveMa200.value !== null) {
    const date = b.aboveMa50.asOf && b.aboveMa200.asOf ? (b.aboveMa50.asOf < b.aboveMa200.asOf ? b.aboveMa50.asOf : b.aboveMa200.asOf) : null;
    if (date) out.breadth = { date, aboveMa50Pct: b.aboveMa50.value, aboveMa200Pct: b.aboveMa200.value,
      coveragePct: Math.min(coverage(b.aboveMa50), coverage(b.aboveMa200)) };
  }
  const e = analytics.earnings;
  // Both shares are needed; the coverage is the smaller of the two denominators (acceleration needs one more stored period).
  if (e && e.positiveGrowth.value !== null && e.accelerating.value !== null) {
    // `date` is the PIT assessment day; each Covered figure retains the underlying reporting-period end.
    out.earnings = { date: analytics.asOf, positiveGrowthPct: e.positiveGrowth.value, acceleratingPct: e.accelerating.value,
      coveragePct: Math.min(coverage(e.positiveGrowth), coverage(e.accelerating)) };
  }
  const s = analytics.scores;
  if (s && s.setupMet.value !== null && s.criteriaBroken.value !== null) {
    if (s.scored.asOf) out.scoreDistribution = { date: s.scored.asOf, setupMetPct: s.setupMet.value,
      criteriaBrokenPct: s.criteriaBroken.value, coveragePct: coverage(s.scored) };
  }
  return out;
}
