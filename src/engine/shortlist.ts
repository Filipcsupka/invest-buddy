import { floorMetrics, type SCANNER_FLOOR } from "@/app/[locale]/(app)/scanner/floor";
import { sessionsBetween } from "@/data/trading-calendar";
import type { SectorGroup } from "@/universe/sector-groups";
import type { StateKey } from "@/i18n/rules";
import { SHORTLIST_CONFIG, type ShortlistConfig } from "./shortlist-config";

/**
 * Shortlist (N1, docs/shortlist.md). Pure functions with an explicit asOf; no I/O and no clock.
 *
 * Input is the stored scored universe of one day as the pages display it. Only names whose displayed state is Setup met are
 * candidates; the rest of the universe is used only to rank relative strength. Gates:
 *   F1 full evidence: points with data >= minEvidencedPoints of 25.
 *   F2 leadership and liquidity: RS percentile >= minRsPercentile and traded value >= minTradedValueUsd.
 *   F3 event risk: a flag only (report soon, deep drawdown); it never removes a name.
 * An input that is missing is "not assessed": it neither passes nor fails the gate, and the row says so.
 * The public state (Setup met and the rest) does not change.
 */

export type GateId = "F1" | "F2" | "F3";
export type CheckId = "evidence" | "rs" | "liquidity" | "report" | "drawdown";
export type CheckStatus = "pass" | "fail" | "not-assessed" | "flag" | "clear";
export type ShortlistReason =
  | "EVIDENCE_OK" | "EVIDENCE_LOW" | "EVIDENCE_UNKNOWN"
  | "RS_OK" | "RS_LOW" | "RS_UNKNOWN"
  | "LIQUIDITY_OK" | "LIQUIDITY_LOW" | "LIQUIDITY_UNKNOWN"
  | "REPORT_SOON" | "REPORT_CLEAR" | "REPORT_UNKNOWN"
  | "DRAWDOWN_DEEP" | "DRAWDOWN_CLEAR" | "DRAWDOWN_UNKNOWN";
export type TieBreak = "percent" | "coverage" | "rs" | "atr" | "tradedValue" | "ticker";
export const TIE_BREAKS: readonly TieBreak[] = ["percent", "coverage", "rs", "atr", "tradedValue", "ticker"];

export interface ShortlistBar { close: number; high: number; low: number; volume: number }

/** One stored listing row of the day. */
export interface ShortlistInput {
  ticker: string;
  /** Displayed state (displayScore), not the stored state. */
  displayState: StateKey;
  /** Displayed percent, null when the state shows none. */
  percent: number | null;
  /** Points with data out of 25 (stored evidencedMax, or computed from rule hits). Null when unknown. */
  evidencedPoints: number | null;
  /** Listing bars, oldest first. */
  bars: readonly ShortlistBar[];
  /** Quote currency. Traded value counts only for USD quotes; other or missing currencies leave liquidity not assessed. */
  currency: string | null;
  /** Next report date on or after asOf, null when the calendar has none. `reportStale` marks a date that may be out of date. */
  reportDate: string | null;
  reportStale?: boolean;
  sector: SectorGroup;
}

export interface ShortlistCheck { id: CheckId; gate: GateId; status: CheckStatus; reason: ShortlistReason }
export interface ShortlistMetrics { rsReturnPercent: number | null; rsPercentile: number | null; tradedValueUsd: number | null; atrPercent: number | null; drawdownPercent: number | null; reportSessions: number | null }
export interface ShortlistRow extends ShortlistMetrics {
  ticker: string;
  sector: SectorGroup;
  percent: number | null;
  evidencedPoints: number | null;
  reportDate: string | null;
  checks: ShortlistCheck[];
  /** No gate failed. A not-assessed check keeps the name on the list with a marker. */
  kept: boolean;
  /** Fail reasons; empty for a kept name. */
  dropReasons: ShortlistReason[];
  /** Checks that could not be assessed. */
  notAssessed: CheckId[];
  /** F3 flags. */
  flags: ShortlistReason[];
  /** 1-based rank among kept names, null for dropped ones. */
  rank: number | null;
  /** The first tie-breaker that ordered this row after the row above it. Null on the first row and on dropped rows. */
  decidedBy: TieBreak | null;
}
export interface GateCount { pass: number; fail: number; notAssessed: number }
export interface Shortlist {
  asOf: string;
  configVersion: string;
  /** Names with displayed Setup met. */
  candidates: number;
  /** Kept names in rank order. */
  kept: ShortlistRow[];
  /** Dropped names, ticker order. */
  dropped: ShortlistRow[];
  /** Per gate: names that passed it, failed it, or could not be assessed. F3 counts flags as fail and clear as pass. */
  gates: Record<GateId, GateCount>;
  /** Names left after F1 alone, and after F1 and F2. */
  survivors: { afterF1: number; afterF2: number; flaggedF3: number };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const r1 = (value: number) => Math.round(value * 10) / 10;

/** Price return over the last `sessions` sessions in percent, null with too few bars or a bad close. */
export function sessionReturn(bars: readonly ShortlistBar[], sessions: number): number | null {
  if (bars.length < sessions + 1) return null;
  const first = bars[bars.length - 1 - sessions].close, last = bars[bars.length - 1].close;
  return finite(first) && finite(last) && first > 0 ? r1((last / first - 1) * 100) : null;
}

/** Mean true range over `sessions` as a percent of the last close (same formula as src/engine/horizon.ts). */
export function atrPercent(bars: readonly ShortlistBar[], sessions: number): number | null {
  if (bars.length < sessions + 1) return null;
  const window = bars.slice(-(sessions + 1));
  if (!window.every((b) => finite(b.high) && finite(b.low) && finite(b.close))) return null;
  const ranges = window.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - window[i].close), Math.abs(b.low - window[i].close)));
  const last = window[window.length - 1].close;
  return last > 0 ? r1(ranges.reduce((s, v) => s + v, 0) / ranges.length / last * 100) : null;
}

/** Percent below the highest high of the last `sessions` bars. Fewer bars use what there is; none gives null. */
export function drawdownPercent(bars: readonly ShortlistBar[], sessions: number): number | null {
  const window = bars.slice(-sessions);
  if (!window.length || !window.every((b) => finite(b.high))) return null;
  const high = Math.max(...window.map((b) => b.high));
  const last = window[window.length - 1].close;
  return finite(last) && high > 0 ? r1(Math.max(0, (1 - last / high) * 100)) : null;
}

/** Average daily traded value in USD from the scanner floor math. Non-USD and unknown quotes give null, never a converted guess. */
export function tradedValueUsd(bars: readonly ShortlistBar[], currency: string | null, sessions: number): number | null {
  if ((currency ?? "").trim().toUpperCase() !== "USD") return null;
  // floorMetrics types its window as the scanner floor's literal; the shortlist config passes the same value.
  const value = floorMetrics(bars, null, sessions as typeof SCANNER_FLOOR.days).avgDollarVolume;
  return finite(value) ? Math.round(value) : null;
}

/** NYSE sessions after asOf up to and including the report date; 0 when the report is on asOf. Null outside the calendar. */
export function sessionsUntil(asOf: string, reportDate: string | null): number | null {
  if (!reportDate || reportDate < asOf) return null;
  if (reportDate === asOf) return 0;
  try {
    const next = new Date(Date.parse(`${asOf}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return sessionsBetween(next, reportDate).length;
  } catch { return null; }
}

/** Percentile rank (0-100) of each finite value among all finite values: the share of the other values at or below it, so ties share the higher rank. */
export function percentileRanks(values: ReadonlyMap<string, number | null>): Map<string, number | null> {
  const known = [...values.values()].filter(finite).sort((a, b) => a - b);
  const atOrBelow = (value: number) => { let lo = 0, hi = known.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (known[mid] <= value) lo = mid + 1; else hi = mid; } return lo; };
  return new Map([...values].map(([ticker, value]) => [ticker, !finite(value) ? null : known.length < 2 ? null : Math.round((atOrBelow(value) - 1) / (known.length - 1) * 100)]));
}

function checksFor(input: ShortlistInput, metrics: ShortlistMetrics, config: ShortlistConfig): ShortlistCheck[] {
  const evidence: ShortlistCheck = !finite(input.evidencedPoints) ? { id: "evidence", gate: "F1", status: "not-assessed", reason: "EVIDENCE_UNKNOWN" }
    : input.evidencedPoints >= config.minEvidencedPoints ? { id: "evidence", gate: "F1", status: "pass", reason: "EVIDENCE_OK" }
    : { id: "evidence", gate: "F1", status: "fail", reason: "EVIDENCE_LOW" };
  const rs: ShortlistCheck = metrics.rsPercentile === null ? { id: "rs", gate: "F2", status: "not-assessed", reason: "RS_UNKNOWN" }
    : metrics.rsPercentile >= config.minRsPercentile ? { id: "rs", gate: "F2", status: "pass", reason: "RS_OK" }
    : { id: "rs", gate: "F2", status: "fail", reason: "RS_LOW" };
  const liquidity: ShortlistCheck = metrics.tradedValueUsd === null ? { id: "liquidity", gate: "F2", status: "not-assessed", reason: "LIQUIDITY_UNKNOWN" }
    : metrics.tradedValueUsd >= config.minTradedValueUsd ? { id: "liquidity", gate: "F2", status: "pass", reason: "LIQUIDITY_OK" }
    : { id: "liquidity", gate: "F2", status: "fail", reason: "LIQUIDITY_LOW" };
  const report: ShortlistCheck = metrics.reportSessions === null || input.reportStale ? { id: "report", gate: "F3", status: "not-assessed", reason: "REPORT_UNKNOWN" }
    : metrics.reportSessions <= config.reportWithinSessions ? { id: "report", gate: "F3", status: "flag", reason: "REPORT_SOON" }
    : { id: "report", gate: "F3", status: "clear", reason: "REPORT_CLEAR" };
  const drawdown: ShortlistCheck = metrics.drawdownPercent === null ? { id: "drawdown", gate: "F3", status: "not-assessed", reason: "DRAWDOWN_UNKNOWN" }
    : metrics.drawdownPercent > config.maxDrawdownPercent ? { id: "drawdown", gate: "F3", status: "flag", reason: "DRAWDOWN_DEEP" }
    : { id: "drawdown", gate: "F3", status: "clear", reason: "DRAWDOWN_CLEAR" };
  return [evidence, rs, liquidity, report, drawdown];
}

type Ranked = Pick<ShortlistRow, "ticker" | "percent" | "evidencedPoints" | "rsPercentile" | "atrPercent" | "tradedValueUsd">;
/** Higher first; a missing value sorts after any known one. */
const desc = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a);
/** Lower first; a missing value sorts after any known one. */
const asc = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
const COMPARE: Record<TieBreak, (a: Ranked, b: Ranked) => number> = {
  percent: (a, b) => desc(a.percent, b.percent),
  coverage: (a, b) => desc(a.evidencedPoints, b.evidencedPoints),
  rs: (a, b) => desc(a.rsPercentile, b.rsPercentile),
  atr: (a, b) => asc(a.atrPercent, b.atrPercent),
  tradedValue: (a, b) => desc(a.tradedValueUsd, b.tradedValueUsd),
  ticker: (a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0),
};
/** The published order: percent, coverage, RS percentile, lower ATR, higher traded value, ticker. */
export const compareShortlist = (a: Ranked, b: Ranked): number => { for (const key of TIE_BREAKS) { const d = COMPARE[key](a, b); if (d) return d; } return 0; };
/** First tie-breaker that separates two rows, null when they are equal on every key. */
export const decidingTieBreak = (above: Ranked, below: Ranked): TieBreak | null => TIE_BREAKS.find((key) => COMPARE[key](above, below) !== 0) ?? null;

export function buildShortlist(asOf: string, universe: readonly ShortlistInput[], config: ShortlistConfig = SHORTLIST_CONFIG): Shortlist {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`Invalid asOf ${asOf}`);
  const returns = new Map(universe.map((row) => [row.ticker, sessionReturn(row.bars, config.rsSessions)]));
  const percentiles = percentileRanks(returns);
  const rows: ShortlistRow[] = universe.filter((row) => row.displayState === "setup").map((input) => {
    const metrics: ShortlistMetrics = {
      rsReturnPercent: returns.get(input.ticker) ?? null,
      rsPercentile: percentiles.get(input.ticker) ?? null,
      tradedValueUsd: tradedValueUsd(input.bars, input.currency, config.tradedValueSessions),
      atrPercent: atrPercent(input.bars, config.atrSessions),
      drawdownPercent: drawdownPercent(input.bars, config.drawdownSessions),
      reportSessions: sessionsUntil(asOf, input.reportDate),
    };
    const checks = checksFor(input, metrics, config);
    const dropReasons = checks.filter((c) => c.status === "fail").map((c) => c.reason);
    return {
      ticker: input.ticker, sector: input.sector, percent: input.percent, evidencedPoints: input.evidencedPoints, reportDate: input.reportDate, ...metrics, checks,
      kept: dropReasons.length === 0, dropReasons,
      notAssessed: checks.filter((c) => c.status === "not-assessed").map((c) => c.id),
      flags: checks.filter((c) => c.status === "flag").map((c) => c.reason),
      rank: null, decidedBy: null,
    };
  });
  const kept = rows.filter((row) => row.kept).sort(compareShortlist)
    .map((row, index, list) => ({ ...row, rank: index + 1, decidedBy: index === 0 ? null : decidingTieBreak(list[index - 1], row) }));
  const dropped = rows.filter((row) => !row.kept).sort((a, b) => COMPARE.ticker(a, b));
  const count = (gate: GateId): GateCount => {
    const of = rows.map((row) => row.checks.filter((c) => c.gate === gate));
    return {
      pass: of.filter((cs) => cs.every((c) => c.status === "pass" || c.status === "clear")).length,
      fail: of.filter((cs) => cs.some((c) => c.status === "fail" || c.status === "flag")).length,
      notAssessed: of.filter((cs) => !cs.some((c) => c.status === "fail" || c.status === "flag") && cs.some((c) => c.status === "not-assessed")).length,
    };
  };
  const fails = (row: ShortlistRow, gate: GateId) => row.checks.some((c) => c.gate === gate && c.status === "fail");
  return {
    asOf, configVersion: config.version, candidates: rows.length, kept, dropped,
    gates: { F1: count("F1"), F2: count("F2"), F3: count("F3") },
    survivors: {
      afterF1: rows.filter((row) => !fails(row, "F1")).length,
      afterF2: rows.filter((row) => !fails(row, "F1") && !fails(row, "F2")).length,
      flaggedF3: kept.filter((row) => row.flags.length).length,
    },
  };
}

export interface SectorShare {
  sector: SectorGroup;
  count: number;
  /** count / total in percent, one decimal. */
  sharePercent: number;
  /** A named group above sectorShareFlagPercent of the list. Unknown is never flagged; its count is reported instead. */
  flagged: boolean;
  /** Tickers in rank order. */
  tickers: string[];
}
export interface SectorConcentration { total: number; thresholdPercent: number; groups: SectorShare[]; unknownCount: number }

/**
 * Concentration lens over a ranked list: count and share per sector group, largest first (Unknown last), and a flag for a named group
 * above the threshold. Counts names only; no money and no weights.
 */
export function sectorConcentration(rows: readonly Pick<ShortlistRow, "ticker" | "sector">[], config: Pick<ShortlistConfig, "sectorShareFlagPercent"> = SHORTLIST_CONFIG): SectorConcentration {
  const total = rows.length;
  const bySector = new Map<SectorGroup, string[]>();
  for (const row of rows) bySector.set(row.sector, [...(bySector.get(row.sector) ?? []), row.ticker]);
  const groups = [...bySector].map(([sector, tickers]) => ({
    sector, count: tickers.length, tickers,
    sharePercent: total ? r1(tickers.length * 100 / total) : 0,
    flagged: sector !== "Unknown" && tickers.length * 100 > config.sectorShareFlagPercent * total,
  })).sort((a, b) => Number(a.sector === "Unknown") - Number(b.sector === "Unknown") || b.count - a.count || a.sector.localeCompare(b.sector));
  return { total, thresholdPercent: config.sectorShareFlagPercent, groups, unknownCount: bySector.get("Unknown")?.length ?? 0 };
}
