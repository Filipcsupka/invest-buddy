/**
 * Deterministic macro flags. PLACEHOLDER RULES for owner review: the thresholds are sensible defaults, not a tested strategy.
 * Pure functions, no database and no network. The job in src/jobs/macro.ts feeds them stored data.
 *
 * dataTailwind: true when the 10-year yield did not rise over the last 20 sessions and VIX is below the cap, false otherwise,
 * null (unknown) when an input is missing, too short or stale.
 * sectorRotationIntoGrowth: true when the universe's average 20-session return beats SPY's by more than the margin.
 */
export interface MacroConfig {
  /** Sessions the yield change and the returns are measured over. */
  windowSessions: number;
  /** dataTailwind needs yield change (percentage points) at or below this. 0 means "not rising". */
  yieldMaxChange: number;
  /** dataTailwind needs the VIX close below this. */
  vixMax: number;
  /** sectorRotationIntoGrowth needs universe average return minus SPY return (percentage points) above this. */
  rotationMargin: number;
  /** An input whose newest point is older than this many calendar days before asOf counts as stale. */
  maxAgeDays: number;
  /** Share of the universe that must have bars for the rotation rule. */
  minCoverage: number;
}
export const DEFAULT_MACRO_CONFIG: MacroConfig = { windowSessions: 20, yieldMaxChange: 0, vixMax: 25, rotationMargin: 2, maxAgeDays: 5, minCoverage: 0.8 };
export const MACRO_RULES_VERSION = "macro-rules-v1";

const number = (value: string | undefined, fallback: number, ok: (n: number) => boolean) => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !ok(parsed)) throw new Error(`Invalid macro setting: ${value}`);
  return parsed;
};
/** Thresholds come from the environment so the owner can change them without a code change. A bad value stops the job instead of silently using a default. */
export function macroConfig(env: Record<string, string | undefined> = process.env): MacroConfig {
  const d = DEFAULT_MACRO_CONFIG;
  return {
    windowSessions: number(env.MACRO_WINDOW_SESSIONS, d.windowSessions, (n) => Number.isInteger(n) && n >= 5 && n <= 60),
    yieldMaxChange: number(env.MACRO_YIELD_MAX_CHANGE_PP, d.yieldMaxChange, () => true),
    vixMax: number(env.MACRO_VIX_MAX, d.vixMax, (n) => n > 0),
    rotationMargin: number(env.MACRO_ROTATION_MARGIN_PP, d.rotationMargin, () => true),
    maxAgeDays: number(env.MACRO_MAX_AGE_DAYS, d.maxAgeDays, (n) => Number.isInteger(n) && n >= 1),
    minCoverage: number(env.MACRO_MIN_COVERAGE, d.minCoverage, (n) => n > 0 && n <= 1),
  };
}

export interface MacroResult { value: boolean | null; reason: string; evidenceDates: string[] }
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const ageDays = (from: string, to: string) => Math.floor((day(to) - day(from)) / 86_400_000);
const r2 = (value: number) => Math.round(value * 100) / 100;
const unknown = (reason: string): MacroResult => ({ value: null, reason: `Unknown: ${reason}`, evidenceDates: [] });

export interface YieldPoint { date: string; value: number }
export interface VixPoint { date: string; close: number }

export function evaluateDataTailwind(yields: YieldPoint[] | null, vix: VixPoint[] | null, asOf: string, config: MacroConfig = DEFAULT_MACRO_CONFIG): MacroResult {
  const known = (yields ?? []).filter((p) => p.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const latestYield = known.at(-1);
  if (!latestYield) return unknown("no 10-year yield observation on or before the date");
  if (ageDays(latestYield.date, asOf) > config.maxAgeDays) return unknown(`10-year yield is stale (newest ${latestYield.date}, limit ${config.maxAgeDays} days)`);
  if (known.length <= config.windowSessions) return unknown(`10-year yield has ${known.length} observations, ${config.windowSessions + 1} needed`);
  const earlier = known[known.length - 1 - config.windowSessions];
  const latestVix = (vix ?? []).filter((p) => p.date <= asOf).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!latestVix) return unknown("no VIX close on or before the date");
  if (ageDays(latestVix.date, asOf) > config.maxAgeDays) return unknown(`VIX is stale (newest ${latestVix.date}, limit ${config.maxAgeDays} days)`);
  const change = r2(latestYield.value - earlier.value);
  const yieldOk = change <= config.yieldMaxChange, vixOk = latestVix.close < config.vixMax;
  const value = yieldOk && vixOk;
  const reason = `${value ? "Tailwind" : "No tailwind"}: 10-year yield ${earlier.date} ${earlier.value} to ${latestYield.date} ${latestYield.value} (change ${change} pp, ${yieldOk ? "at or below" : "above"} ${config.yieldMaxChange}); VIX ${latestVix.date} ${latestVix.close} (${vixOk ? "below" : "not below"} ${config.vixMax}). Placeholder rule ${MACRO_RULES_VERSION}`;
  return { value, reason, evidenceDates: [latestYield.date, latestVix.date] };
}

export interface Bar { date: string; close: number }
/** Close-to-close return in percent over `n` sessions ending at the last bar on or before asOf. Null when there are too few bars. */
function windowReturn(bars: Bar[], asOf: string, n: number): { percent: number; last: string; first: string } | null {
  const upTo = bars.filter((b) => b.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  if (upTo.length <= n) return null;
  const last = upTo[upTo.length - 1], first = upTo[upTo.length - 1 - n];
  return first.close > 0 && last.close > 0 ? { percent: (last.close / first.close - 1) * 100, last: last.date, first: first.date } : null;
}

export function evaluateSectorRotation(universe: Record<string, Bar[]>, spy: Bar[] | null, asOf: string, config: MacroConfig = DEFAULT_MACRO_CONFIG): MacroResult {
  const bench = spy ? windowReturn(spy, asOf, config.windowSessions) : null;
  if (!bench) return unknown("SPY bars are missing or too short");
  if (ageDays(bench.last, asOf) > config.maxAgeDays) return unknown(`SPY bars are stale (newest ${bench.last}, limit ${config.maxAgeDays} days)`);
  const symbols = Object.keys(universe);
  // Only tickers priced on the same last session as SPY count, so the two returns cover the same days.
  const returns = symbols.flatMap((symbol) => { const r = windowReturn(universe[symbol], asOf, config.windowSessions); return r && r.last === bench.last ? [r.percent] : []; });
  if (!symbols.length || returns.length / symbols.length < config.minCoverage) return unknown(`only ${returns.length} of ${symbols.length} universe tickers have bars through ${bench.last}`);
  const average = returns.reduce((n, v) => n + v, 0) / returns.length;
  const spread = r2(average - bench.percent);
  const value = spread > config.rotationMargin;
  return { value, evidenceDates: [bench.last],
    reason: `${value ? "Rotation" : "No rotation"}: universe average ${config.windowSessions}-session return ${r2(average)}% (${returns.length} tickers) minus SPY ${r2(bench.percent)}% = ${spread} pp, ${value ? "above" : "not above"} ${config.rotationMargin} pp (${bench.first} to ${bench.last}). Placeholder rule ${MACRO_RULES_VERSION}` };
}
