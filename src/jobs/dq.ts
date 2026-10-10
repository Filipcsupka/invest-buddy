import pg from "pg";
import type { OHLCV } from "../engine";
import { CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY, isSession, lastCompletedSession, sessionsBetween } from "../data/trading-calendar";
import { runLoggedJob } from "./job-log";

export type DqStatus = "pass" | "warn" | "fail";
export interface DqRow { checkId: string; subject: string; asOf: string; status: DqStatus; detail: Record<string, unknown> }

/** Placeholder thresholds; the owner sets the final values. */
export const DQ_THRESHOLDS = {
  staleDays: 3,
  maxDailyMove: 0.4,
  minRows: 200,
  calendarWarnDays: 60,
  missingSessionsFail: 5,
  /** Bars are read for this many calendar days; row counts above the minimum are capped by it. */
  lookbackDays: 400,
};

export interface DqInput { ticker: string; bars: OHLCV[] }
export interface DqContext { asOf: string; today: string }

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const row = (checkId: string, subject: string, asOf: string, status: DqStatus, detail: Record<string, unknown> = {}): DqRow => ({ checkId, subject, asOf, status, detail });

/** Checks for one ticker. Always returns one row per check. Bars may be unsorted and may hold duplicates. */
export function checkTicker({ ticker, bars }: DqInput, { asOf, today }: DqContext): DqRow[] {
  const t = DQ_THRESHOLDS;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((bar) => bar.date);
  const rows: DqRow[] = [];

  const duplicates = [...new Set(dates.filter((date, i) => i > 0 && date === dates[i - 1]))];
  rows.push(row("duplicate_dates", ticker, asOf, duplicates.length ? "fail" : "pass", duplicates.length ? { dates: duplicates } : {}));

  const unique = sorted.filter((bar, i) => i === 0 || bar.date !== sorted[i - 1].date);
  rows.push(row("row_count", ticker, asOf, unique.length < t.minRows ? "fail" : "pass", { rows: unique.length, minimum: t.minRows }));

  if (!unique.length) {
    rows.push(row("missing_sessions", ticker, asOf, "fail", { reason: "no bars" }));
    rows.push(row("stale_bar", ticker, asOf, "fail", { reason: "no bars" }));
  } else {
    const have = new Set(unique.map((bar) => bar.date));
    const first = unique[0].date < CALENDAR_FIRST_DAY ? CALENDAR_FIRST_DAY : unique[0].date;
    const missing = first <= asOf ? sessionsBetween(first, asOf).filter((date) => !have.has(date)) : [];
    rows.push(row("missing_sessions", ticker, asOf, !missing.length ? "pass" : missing.length >= t.missingSessionsFail ? "fail" : "warn", { count: missing.length, dates: missing.slice(0, 20) }));
    const latest = unique[unique.length - 1].date;
    const ageDays = daysBetween(latest, today);
    rows.push(row("stale_bar", ticker, asOf, ageDays > t.staleDays ? "fail" : "pass", { latest, ageDays, maxDays: t.staleDays }));
  }

  const moves = unique.flatMap((bar, i) => {
    if (!i) return [];
    const change = bar.close / unique[i - 1].close - 1;
    return Math.abs(change) > t.maxDailyMove ? [{ date: bar.date, change: Math.round(change * 10000) / 10000 }] : [];
  });
  rows.push(row("daily_move", ticker, asOf, moves.length ? "warn" : "pass", moves.length ? { moves, maxMove: t.maxDailyMove } : {}));

  const zero = unique.filter((bar) => bar.volume === 0 && bar.date >= CALENDAR_FIRST_DAY && bar.date <= CALENDAR_LAST_DAY && isSession(bar.date)).map((bar) => bar.date);
  rows.push(row("zero_volume", ticker, asOf, zero.length ? "warn" : "pass", zero.length ? { dates: zero } : {}));

  const inverted = sorted.filter((bar) => bar.high < bar.low).map((bar) => bar.date);
  rows.push(row("high_below_low", ticker, asOf, inverted.length ? "fail" : "pass", inverted.length ? { dates: inverted } : {}));
  return rows;
}

/** Fails when the calendar ends within 60 days of today. */
export function checkCalendar({ asOf, today }: DqContext, lastDay = CALENDAR_LAST_DAY): DqRow {
  const daysLeft = daysBetween(today, lastDay);
  return row("calendar_end", "calendar", asOf, daysLeft < DQ_THRESHOLDS.calendarWarnDays ? "fail" : "pass", { lastDay, daysLeft, minimumDays: DQ_THRESHOLDS.calendarWarnDays });
}

export function runChecks(inputs: DqInput[], ctx: DqContext, lastDay?: string): DqRow[] {
  return [...inputs.flatMap((input) => checkTicker(input, ctx)), checkCalendar(ctx, lastDay)];
}

export const hasFail = (rows: DqRow[]) => rows.some((r) => r.status === "fail");

export async function loadInputs(db: Pick<pg.Pool, "query">, today: string): Promise<DqInput[]> {
  const result = await db.query<{ ticker: string; bar_date: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT i.ticker, b.bar_date::text AS bar_date, b.open, b.high, b.low, b.close, b.volume
     FROM instruments i LEFT JOIN daily_bars b ON b.ticker = i.ticker AND b.bar_date >= $1::date - $2::int
     ORDER BY i.ticker, b.bar_date`, [today, DQ_THRESHOLDS.lookbackDays]);
  const byTicker = new Map<string, OHLCV[]>();
  for (const r of result.rows) {
    const list = byTicker.get(r.ticker) ?? [];
    if (r.bar_date) list.push({ date: r.bar_date, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) });
    byTicker.set(r.ticker, list);
  }
  return [...byTicker].map(([ticker, bars]) => ({ ticker, bars }));
}

/** Upserts on (check_id, subject, as_of), so a rerun on the same day replaces that day's rows. */
export async function saveRows(db: Pick<pg.Pool, "query">, rows: DqRow[]): Promise<void> {
  if (!rows.length) return;
  await db.query(
    `INSERT INTO dq_results (check_id, subject, as_of, status, detail, run_at)
     SELECT c, s, a, st, d::jsonb, now() FROM unnest($1::text[], $2::text[], $3::date[], $4::text[], $5::text[]) AS t(c, s, a, st, d)
     ON CONFLICT (check_id, subject, as_of) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, run_at = EXCLUDED.run_at`,
    [rows.map((r) => r.checkId), rows.map((r) => r.subject), rows.map((r) => r.asOf), rows.map((r) => r.status), rows.map((r) => JSON.stringify(r.detail))]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ctx = { asOf: lastCompletedSession(now), today };
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = runChecks(await loadInputs(pool, today), ctx);
    await saveRows(pool, rows);
    const count = (status: DqStatus) => rows.filter((r) => r.status === status).length;
    for (const r of rows.filter((x) => x.status === "fail")) process.stdout.write(`${JSON.stringify({ event: "dq_fail", check: r.checkId, subject: r.subject })}\n`);
    if (hasFail(rows)) process.exitCode = 1;
    return { asOf: ctx.asOf, pass: count("pass"), warn: count("warn"), fail: count("fail"), failures: count("fail") };
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])dq\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("dq", main);
