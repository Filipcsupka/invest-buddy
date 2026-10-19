import { canDisplay } from "./sources-registry";

/**
 * Forward EPS estimate revisions from the stored Alpha Vantage earnings calendar (earnings_calendar_snapshots, migration 046).
 * Report only: the fact scores 0 points and no rule reads it. Alpha Vantage display rights are not verified (internal_only),
 * so the figures are for the owner view only; public pages get nothing. Scoring would need an owner decision and a rules version bump.
 */
export const ESTIMATE_REVISION_SOURCE = "alphavantage";
export const ESTIMATE_REVISION_SOURCE_NAME = "Alpha Vantage";
export const ESTIMATE_REVISION_POINTS = 0;
export const REVISION_WINDOWS = [30, 60, 90] as const;
/** A baseline counts only when it was observed at most this many days before the window start, so a gap in daily pulls does not stretch the window. */
export const BASELINE_TOLERANCE_DAYS = 7;
/** Days of snapshots a reader needs for the longest window plus the tolerance. */
export const REVISION_LOOKBACK_DAYS = Math.max(...REVISION_WINDOWS) + BASELINE_TOLERANCE_DAYS;

/** One stored calendar row: what the calendar said on `observedOn` about one expected report. */
export interface EstimateObservation { observedOn: string; reportDate: string; fiscalDateEnding: string | null; estimate: number | null }

export type RevisionDirection = "up" | "down" | "flat";
export interface RevisionWindow {
  days: number;
  /** Day of the baseline observation; null when no usable baseline exists. */
  fromObservedOn: string | null;
  fromEstimate: number | null;
  change: number | null;
  /** Change as a percent of the absolute baseline; null when the baseline is 0 or missing. */
  changePct: number | null;
  direction: RevisionDirection | null;
}

export interface EstimateRevisionFact {
  ticker: string;
  asOf: string;
  reportDate: string;
  fiscalDateEnding: string | null;
  currentObservedOn: string;
  currentEstimate: number | null;
  windows: RevisionWindow[];
  sourceId: typeof ESTIMATE_REVISION_SOURCE;
  points: typeof ESTIMATE_REVISION_POINTS;
}

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** Same expected report: the fiscal quarter when both rows carry one (a moved report date stays the same quarter), else the report date. */
const sameReport = (a: EstimateObservation, b: EstimateObservation) =>
  a.fiscalDateEnding && b.fiscalDateEnding ? a.fiscalDateEnding === b.fiscalDateEnding : a.reportDate === b.reportDate;

/**
 * The next expected report as the newest pull on or before `asOf` saw it: its earliest report date on or after `asOf`.
 * Rows observed after `asOf` are ignored, so a replay gives the answer that was knowable on that day.
 */
export function nextReport(rows: EstimateObservation[], asOf: string): EstimateObservation | null {
  const known = rows.filter((row) => row.observedOn <= asOf);
  const newest = known.reduce<string | null>((max, row) => (max === null || row.observedOn > max ? row.observedOn : max), null);
  if (newest === null) return null;
  const upcoming = known.filter((row) => row.observedOn === newest && row.reportDate >= asOf).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  return upcoming[0] ?? null;
}

function revisionWindow(rows: EstimateObservation[], current: EstimateObservation, asOf: string, days: number): RevisionWindow {
  const start = shift(asOf, -days);
  const earliest = shift(start, -BASELINE_TOLERANCE_DAYS);
  const baseline = rows
    .filter((row) => row.observedOn <= start && row.observedOn >= earliest && row.estimate !== null && sameReport(row, current))
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0];
  if (!baseline || baseline.estimate === null || current.estimate === null) {
    return { days, fromObservedOn: baseline?.observedOn ?? null, fromEstimate: baseline?.estimate ?? null, change: null, changePct: null, direction: null };
  }
  const change = round(current.estimate - baseline.estimate, 4);
  const changePct = baseline.estimate === 0 ? null : round((change / Math.abs(baseline.estimate)) * 100, 2);
  return { days, fromObservedOn: baseline.observedOn, fromEstimate: baseline.estimate, change, changePct, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

/**
 * Revision of the consensus EPS estimate for the next expected report over 30, 60 and 90 days, from one ticker's stored rows.
 * null when no pull on or before `asOf` lists an upcoming report. A window without a baseline in range, or without an
 * estimate on either end, has null change; nothing is filled in or carried over.
 */
export function estimateRevision(ticker: string, rows: EstimateObservation[], asOf: string, windows: readonly number[] = REVISION_WINDOWS): EstimateRevisionFact | null {
  const current = nextReport(rows, asOf);
  if (!current) return null;
  const known = rows.filter((row) => row.observedOn <= asOf);
  return {
    ticker, asOf, reportDate: current.reportDate, fiscalDateEnding: current.fiscalDateEnding, currentObservedOn: current.observedOn,
    currentEstimate: current.estimate, windows: windows.map((days) => revisionWindow(known, current, asOf, days)),
    sourceId: ESTIMATE_REVISION_SOURCE, points: ESTIMATE_REVISION_POINTS,
  };
}

const signed = (value: number, places: number) => `${value > 0 ? "+" : ""}${value.toFixed(places)}`;

/**
 * One plain owner-side line, e.g. "Next report 2026-11-05: EPS estimate 1.23; 30d +0.05 (+4.24%), 60d n/a, 90d -0.02 (-1.60%). Alpha Vantage, not scored."
 * Returns null for any audience other than the owner while the source may not be displayed.
 */
export function formatEstimateRevision(fact: EstimateRevisionFact, audience: "owner" | "public"): string | null {
  if (audience !== "owner" && !canDisplay(fact.sourceId)) return null;
  const estimate = fact.currentEstimate === null ? "no EPS estimate" : `EPS estimate ${fact.currentEstimate.toFixed(2)}`;
  const windows = fact.windows.map((w) => `${w.days}d ${w.change === null ? "n/a" : `${signed(w.change, 2)}${w.changePct === null ? "" : ` (${signed(w.changePct, 2)}%)`}`}`).join(", ");
  return `Next report ${fact.reportDate}: ${estimate}; ${windows}. ${ESTIMATE_REVISION_SOURCE_NAME}, not scored.`;
}
