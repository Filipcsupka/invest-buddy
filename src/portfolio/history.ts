import { isoFlexDate } from "./eur";
import { parseFlexStatement, type FlexRaw } from "./flex";

/** One stored NAV point. Private: only server code reads it, and only to compute indexed series. */
export interface NavPoint {
  date: string;
  navEur: number;
  /** Net deposits and withdrawals between the previous stored date and this one. */
  depositsEur: number;
  source: "flex-daily" | "flex-summary";
}

function num(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * NAV points from every ChangeInNAV row of a statement. Per-day rows (reportDate, or fromDate equal to toDate) give one
 * 'flex-daily' point at their end date. A period row (fromDate before toDate) gives only its two ends: the starting value
 * at fromDate and the ending value, with the period deposits, at toDate. Attributes are read defensively. Rows in a
 * currency other than EUR, or without usable values, are skipped.
 */
export function navPointsFromRaw(raw: FlexRaw): NavPoint[] {
  const points = new Map<string, NavPoint>();
  const put = (point: NavPoint) => {
    const old = points.get(point.date);
    if (!old || (old.source !== "flex-daily" && point.source === "flex-daily")) points.set(point.date, point);
  };
  const single = raw.navRows.length === 1;
  for (const row of raw.navRows) {
    const currency = String(row.currency ?? "").trim().toUpperCase();
    if (currency && currency !== "EUR" && currency !== "BASE_SUMMARY") continue;
    const rowTo = isoFlexDate(row.reportDate ?? row.toDate ?? row.date ?? (single ? raw.toDate : undefined));
    const rowFrom = isoFlexDate(row.fromDate ?? (single ? raw.fromDate : undefined));
    const end = num(row.endingValue);
    const start = num(row.startingValue);
    const deposits = num(row.depositsWithdrawals) ?? num(row.deposits) ?? 0;
    if (!rowTo || end === null || end <= 0) continue;
    if (rowFrom && rowFrom < rowTo && !row.reportDate) {
      put({ date: rowTo, navEur: end, depositsEur: deposits, source: "flex-summary" });
      if (start !== null && start > 0) put({ date: rowFrom, navEur: start, depositsEur: 0, source: "flex-summary" });
    } else put({ date: rowTo, navEur: end, depositsEur: deposits, source: "flex-daily" });
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function navPointsFromXml(xml: string): NavPoint[] {
  return navPointsFromRaw(parseFlexStatement(xml));
}

export interface IndexedPoint { date: string; portfolio: number; benchmark: number | null }
export interface IndexedSeries {
  points: IndexedPoint[];
  /** Chained time-weighted return since the first date, in percent. Null with fewer than two points. */
  twrPercent: number | null;
  /** SPY return over the same dates, in percent. Null when no bar exists on or before the first date. */
  benchmarkPercent: number | null;
}

/**
 * Chains r_t = (nav_t - nav_{t-1} - deposits_t) / nav_{t-1} between consecutive stored dates, indexed to 100 at the first date.
 * nav_{t-1} is the previous stored NAV, which equals the report's starting value for per-day rows.
 * SPY uses the last bar on or before each date, indexed to 100 at the first date. Only indexed values leave this function.
 */
export function buildIndexedSeries(history: NavPoint[], bars: { date: string; close: number }[]): IndexedSeries {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const spy = bars.filter((bar) => bar.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  let cursor = -1;
  const closeAt = (date: string) => {
    while (cursor + 1 < spy.length && spy[cursor + 1].date <= date) cursor++;
    return cursor >= 0 ? spy[cursor].close : null;
  };
  const baseClose = sorted.length ? closeAt(sorted[0].date) : null;
  let index = 100;
  const points = sorted.map((point, i) => {
    if (i > 0) {
      const previous = sorted[i - 1].navEur;
      if (previous > 0) index *= 1 + (point.navEur - previous - point.depositsEur) / previous;
    }
    const close = closeAt(point.date);
    return { date: point.date, portfolio: Number(index.toFixed(4)), benchmark: baseClose && close ? Number((100 * close / baseClose).toFixed(4)) : null };
  });
  const last = points.at(-1);
  return {
    points,
    twrPercent: points.length > 1 ? Number((index - 100).toFixed(2)) : null,
    benchmarkPercent: points.length > 1 && last?.benchmark != null ? Number((last.benchmark - 100).toFixed(2)) : null,
  };
}
