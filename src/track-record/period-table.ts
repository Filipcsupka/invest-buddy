import { hitRate } from "./measure";

/** The parts of a record signal the table needs. `RecordSignal` fits. */
export interface PeriodSignal {
  ticker: string;
  asOf: string;
  tier: string;
  windows: { 20: { stock: number; spy: number; excess: number } | null };
}
export interface SpyBar { date: string; close: number }

export type PeriodGrain = "month" | "year";
export interface PeriodRow {
  /** `2026-10` for a month, `2026` for a year. */
  period: string;
  /** Signals with a measured 20-trading-day window. */
  n: number;
  /** Signals in the period whose 20-day window is still pending. */
  pending: number;
  /** Share of measured signals that beat SPY, null when none is measured. */
  hitRate: number | null;
  /** Mean of stock return minus SPY return over the same 20 trading days, null when none is measured. */
  meanExcess: number | null;
  /** SPY close-to-close change across the calendar period, null without bars. */
  spyChange: number | null;
}
export interface PeriodTable { grain: PeriodGrain; rows: PeriodRow[]; spy: { from: string; to: string; change: number } | null }

const DAY = 86_400_000;

/** Month while the log is under a year old, year after. */
export function periodGrain(firstDate: string, today: string): PeriodGrain {
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / DAY < 365 ? "month" : "year";
}

/** The last close before `from` is the base, else the first close inside the period. */
function spyChange(bars: SpyBar[], from: string, to: string): number | null {
  const inside = bars.filter((bar) => bar.date >= from && bar.date <= to);
  const end = inside.at(-1);
  const base = bars.findLast((bar) => bar.date < from) ?? inside[0];
  if (!end || !base) return null;
  return end.close / base.close - 1;
}

/**
 * Rows by calendar period, newest first, for the unique buy signals (BROKEN rows are not buys). Each ticker and day counts once.
 * A period that lost to SPY stays a plain row. Pure: `today` and `logStart` (first recorded snapshot, else the first signal) decide the grain, nothing reads the clock.
 */
export function periodTable(signals: PeriodSignal[], spyBars: SpyBar[], today: string, logStart?: string | null): PeriodTable {
  const unique = new Map<string, PeriodSignal>();
  for (const signal of signals) {
    if (signal.tier === "BROKEN") continue;
    const key = `${signal.ticker}:${signal.asOf}`;
    if (!unique.has(key)) unique.set(key, signal);
  }
  const all = [...unique.values()];
  if (!all.length) return { grain: "month", rows: [], spy: null };
  const first = all.map((s) => s.asOf).sort()[0];
  const grain = periodGrain(logStart ?? first, today);
  const size = grain === "month" ? 7 : 4;
  const bars = spyBars.filter((bar) => bar.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const periods = [...new Set(all.map((s) => s.asOf.slice(0, size)))].sort().reverse();
  const rows = periods.map((period): PeriodRow => {
    const inPeriod = all.filter((s) => s.asOf.startsWith(period));
    const excess = inPeriod.map((s) => s.windows[20]?.excess ?? null);
    const measured = excess.filter((value): value is number => value !== null);
    const from = grain === "month" ? `${period}-01` : `${period}-01-01`;
    const to = grain === "month" ? `${period}-31` : `${period}-12-31`;
    return { period, n: measured.length, pending: inPeriod.length - measured.length, hitRate: hitRate(excess).rate,
      meanExcess: measured.length ? measured.reduce((sum, v) => sum + v, 0) / measured.length : null, spyChange: spyChange(bars, from, to) };
  });
  const last = bars.at(-1);
  const start = bars.findLast((bar) => bar.date <= first) ?? bars.find((bar) => bar.date > first);
  const spy = last && start && last.date > start.date ? { from: start.date, to: last.date, change: last.close / start.close - 1 } : null;
  return { grain, rows, spy };
}
