import type pg from "pg";
import {
  CALENDAR_HORIZON_DAYS, catalystCalendar, nextEarnings, preEarningsFlags,
  type CatalystEvent, type EarningsSnapshotRow, type FutureFindingRow, type NextEarnings, type PreEarningsFlag,
} from "../data/catalyst-calendar";

type Query = Pick<pg.Pool, "query">;

export interface CatalystCalendarView {
  asOf: string;
  /** Newest earnings calendar pull on or before asOf, or null when none is stored. */
  latestPull: string | null;
  next: NextEarnings[];
  events: CatalystEvent[];
  preEarnings: PreEarningsFlag[];
}

/**
 * Per ticker: every row of its newest pull on or before asOf, plus older rows of the same fiscal period with a different
 * report date (the input for `previousReportDate`). Rows of older pulls that only repeat the date are not read.
 */
export async function readEarningsSnapshots(db: Query, asOf: string, symbols?: string[]): Promise<{ rows: EarningsSnapshotRow[]; latestPull: string | null }> {
  const r = await db.query<EarningsSnapshotRow>(`
    WITH seen AS (SELECT * FROM earnings_calendar_snapshots WHERE observed_on <= $1::date AND ($2::text[] IS NULL OR ticker = ANY($2::text[]))),
    newest AS (SELECT ticker, max(observed_on) AS observed_on FROM seen GROUP BY ticker),
    cur AS (SELECT DISTINCT ON (s.ticker,COALESCE(s.fiscal_date_ending,s.report_date)) s.*
      FROM seen s JOIN newest n ON n.ticker = s.ticker AND n.observed_on = s.observed_on
      ORDER BY s.ticker,COALESCE(s.fiscal_date_ending,s.report_date),CASE WHEN s.source_id='eodhd' THEN 0 ELSE 1 END,s.report_date),
    moved AS (SELECT o.* FROM seen o JOIN cur c ON c.ticker = o.ticker AND c.source_id=o.source_id AND c.fiscal_date_ending = o.fiscal_date_ending
      WHERE o.observed_on < c.observed_on AND o.report_date <> c.report_date AND c.report_date >= $1::date)
    SELECT ticker, observed_on::text AS "observedOn", report_date::text AS "reportDate", fiscal_date_ending::text AS "fiscalDateEnding",
      time_of_day AS "timeOfDay"
    FROM (SELECT * FROM cur UNION SELECT * FROM moved) x
    ORDER BY ticker, observed_on DESC, report_date`, [asOf, symbols ?? null]);
  const latest = await db.query<{ latestPull: string | null }>(
    `SELECT max(observed_on)::text AS "latestPull" FROM earnings_calendar_snapshots WHERE observed_on <= $1::date`, [asOf]);
  return { rows: r.rows, latestPull: latest.rows[0]?.latestPull ?? null };
}

/** Verified research findings with an event date from asOf to asOf + horizonDays. */
export async function readFutureFindings(db: Query, asOf: string, horizonDays = CALENDAR_HORIZON_DAYS, symbols?: string[]): Promise<FutureFindingRow[]> {
  const r = await db.query<FutureFindingRow>(`
    SELECT id::int AS id, symbol, kind, claim, event_date::text AS "eventDate", confirmed, dedupe_key AS "dedupeKey",
      to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "verifiedAt"
    FROM research_findings
    WHERE verification_status = 'verified' AND verified_at IS NOT NULL AND event_date BETWEEN $1::date AND $1::date + $2::int
      AND ($3::text[] IS NULL OR symbol = ANY($3::text[]))
    ORDER BY event_date, symbol, id`, [asOf, horizonDays, symbols ?? null]);
  return r.rows;
}

/** Symbols of the newest portfolio baseline on or before asOf (symbols only; no quantities or values leave this query). */
export async function readHeldSymbols(db: Query, asOf: string): Promise<string[]> {
  const r = await db.query<{ symbol: string }>(`
    SELECT DISTINCT p->>'symbol' AS symbol
    FROM (SELECT positions FROM portfolio_baseline WHERE as_of <= $1::date ORDER BY as_of DESC LIMIT 1) b, jsonb_array_elements(b.positions) p
    ORDER BY 1`, [asOf]);
  return r.rows.map((row) => row.symbol).filter(Boolean);
}

export async function readStartReadySymbols(db: Query): Promise<string[]> {
  const r = await db.query<{ symbol: string }>("SELECT symbol FROM research_candidates WHERE state = 'START_READY' ORDER BY symbol");
  return r.rows.map((row) => row.symbol);
}

/** Owner-side catalyst calendar: next earnings per ticker, dated research catalysts, and pre-earnings flags. Reads only. */
export async function readCatalystCalendar(db: Query, asOf: string, options: { horizonDays?: number; windowDays?: number; symbols?: string[] } = {}): Promise<CatalystCalendarView> {
  const horizonDays = options.horizonDays ?? CALENDAR_HORIZON_DAYS;
  // Sequential, so a single pg.Client (one connection) works as well as a pool.
  const snapshots = await readEarningsSnapshots(db, asOf, options.symbols);
  const findings = await readFutureFindings(db, asOf, horizonDays, options.symbols);
  const held = await readHeldSymbols(db, asOf);
  const startReady = await readStartReadySymbols(db);
  const next = nextEarnings(snapshots.rows, asOf, { latestPull: snapshots.latestPull });
  return {
    asOf, latestPull: snapshots.latestPull, next,
    events: catalystCalendar({ next, findings, asOf, horizonDays, symbols: options.symbols }),
    preEarnings: preEarningsFlags({ next, held, startReady, windowDays: options.windowDays }),
  };
}
