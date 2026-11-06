/**
 * P3: catalyst calendar read model. Pure functions over stored rows: the Alpha Vantage earnings calendar
 * (earnings_calendar_snapshots, one pull a day, append-only) and future-dated verified research findings.
 * No request, no score input. Owner side only until the display rights for calendar dates are settled.
 */

/** Calendar days before a report date in which a held or START_READY name is flagged. Placeholder until the owner sets it. */
export const PRE_EARNINGS_DAYS = 7;
/** Default look-ahead of the calendar list. */
export const CALENDAR_HORIZON_DAYS = 90;
/** A ticker's newest calendar row older than this is stale even when no newer pull exists. */
export const CALENDAR_STALE_DAYS = 7;

export type EarningsTime = "pre-market" | "post-market";

/** One earnings_calendar_snapshots row. Dates are YYYY-MM-DD. */
export interface EarningsSnapshotRow {
  ticker: string;
  observedOn: string;
  reportDate: string;
  fiscalDateEnding: string | null;
  timeOfDay: string | null;
}

export interface NextEarnings {
  ticker: string;
  reportDate: string;
  /** Normalised Alpha Vantage timeOfTheDay; null when the source gave none or an unknown value. */
  timeOfDay: EarningsTime | null;
  fiscalDateEnding: string | null;
  /** Calendar pull the date comes from. */
  observedOn: string;
  daysUntil: number;
  /** The newest pull no longer lists this ticker, or its pull is older than CALENDAR_STALE_DAYS. */
  stale: boolean;
  /** Report date an earlier pull gave for the same fiscal period, when the date has since moved. */
  previousReportDate: string | null;
}

/** One verified research finding whose event date lies ahead. */
export interface FutureFindingRow {
  id: number;
  symbol: string;
  kind: string;
  claim: string;
  eventDate: string;
  confirmed: boolean;
  dedupeKey: string;
  verifiedAt: string;
}

export type CatalystEvent =
  | { type: "earnings"; symbol: string; date: string; daysUntil: number; timeOfDay: EarningsTime | null; stale: boolean; previousReportDate: string | null }
  | { type: "research"; symbol: string; date: string; daysUntil: number; kind: string; claim: string; confirmed: boolean; findingId: number };

export interface PreEarningsFlag {
  symbol: string;
  reason: "held" | "start_ready";
  reportDate: string;
  timeOfDay: EarningsTime | null;
  daysUntil: number;
  /** The calendar date may be out of date; see NextEarnings.stale. */
  stale: boolean;
}

const DAY_MS = 86_400_000;
/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Maps the Alpha Vantage values ("pre-market", "post-market", also seen as BMO/AMC) to one form. */
export function normaliseTimeOfDay(value: string | null | undefined): EarningsTime | null {
  const v = (value ?? "").trim().toLowerCase();
  if (/^(?:pre[-_ ]?market|bmo|before[-_ ]?(?:market[-_ ]?)?open)$/.test(v)) return "pre-market";
  if (/^(?:post[-_ ]?market|amc|after[-_ ]?(?:market[-_ ]?)?close)$/.test(v)) return "post-market";
  return null;
}

/**
 * Next report per ticker on or after `asOf`, read from the ticker's newest pull on or before `asOf`. Older pulls only supply
 * `previousReportDate`, so a moved date never shows twice. A ticker whose newest pull has no date ahead is left out.
 * `latestPull` is the newest pull of the whole calendar; without it the newest pull among `rows` is used.
 */
export function nextEarnings(rows: EarningsSnapshotRow[], asOf: string, options: { staleDays?: number; latestPull?: string | null } = {}): NextEarnings[] {
  const staleDays = options.staleDays ?? CALENDAR_STALE_DAYS;
  const seen = rows.filter((r) => r.observedOn <= asOf);
  const latestPull = options.latestPull ?? seen.reduce((max, r) => (r.observedOn > max ? r.observedOn : max), "");
  const byTicker = new Map<string, EarningsSnapshotRow[]>();
  for (const row of seen) byTicker.set(row.ticker, [...(byTicker.get(row.ticker) ?? []), row]);
  const out: NextEarnings[] = [];
  for (const [ticker, list] of byTicker) {
    const newestPull = list.reduce((max, r) => (r.observedOn > max ? r.observedOn : max), "");
    const next = list.filter((r) => r.observedOn === newestPull && r.reportDate >= asOf)
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate))[0];
    if (!next) continue;
    const moved = next.fiscalDateEnding === null ? undefined : list
      .filter((r) => r.observedOn < newestPull && r.fiscalDateEnding === next.fiscalDateEnding && r.reportDate !== next.reportDate)
      .sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0];
    out.push({
      ticker, reportDate: next.reportDate, timeOfDay: normaliseTimeOfDay(next.timeOfDay), fiscalDateEnding: next.fiscalDateEnding,
      observedOn: newestPull, daysUntil: daysBetween(asOf, next.reportDate),
      stale: newestPull < latestPull || daysBetween(newestPull, asOf) > staleDays,
      previousReportDate: moved?.reportDate ?? null,
    });
  }
  return out.sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.ticker.localeCompare(b.ticker));
}

/** Future-dated findings within the horizon, one per dedupe key (the newest verified row wins). */
export function futureFindings(rows: FutureFindingRow[], asOf: string, horizonDays = CALENDAR_HORIZON_DAYS): FutureFindingRow[] {
  const byKey = new Map<string, FutureFindingRow>();
  for (const row of rows) {
    const days = daysBetween(asOf, row.eventDate);
    if (days < 0 || days > horizonDays) continue;
    const kept = byKey.get(row.dedupeKey);
    if (!kept || row.verifiedAt > kept.verifiedAt || (row.verifiedAt === kept.verifiedAt && row.id > kept.id)) byKey.set(row.dedupeKey, row);
  }
  return [...byKey.values()];
}

/**
 * Dated catalysts (next earnings from `nextEarnings`, future research findings) from `asOf` to `asOf + horizonDays`, sorted by date, symbol, then earnings before research.
 * `symbols` limits the list when given.
 */
export function catalystCalendar(input: { next: NextEarnings[]; findings: FutureFindingRow[]; asOf: string; horizonDays?: number; symbols?: string[] }): CatalystEvent[] {
  const horizon = input.horizonDays ?? CALENDAR_HORIZON_DAYS;
  const wanted = input.symbols ? new Set(input.symbols) : null;
  const keep = (symbol: string) => !wanted || wanted.has(symbol);
  const events: CatalystEvent[] = [
    ...input.next.filter((e) => keep(e.ticker) && e.daysUntil <= horizon).map((e): CatalystEvent => ({
      type: "earnings", symbol: e.ticker, date: e.reportDate, daysUntil: e.daysUntil, timeOfDay: e.timeOfDay, stale: e.stale, previousReportDate: e.previousReportDate,
    })),
    ...futureFindings(input.findings, input.asOf, horizon).filter((f) => keep(f.symbol)).map((f): CatalystEvent => ({
      type: "research", symbol: f.symbol, date: f.eventDate, daysUntil: daysBetween(input.asOf, f.eventDate), kind: f.kind, claim: f.claim, confirmed: f.confirmed, findingId: f.id,
    })),
  ];
  const order = (e: CatalystEvent) => (e.type === "earnings" ? 0 : 1);
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol) || order(a) - order(b)
    || (a.type === "research" && b.type === "research" ? a.findingId - b.findingId : 0));
}

/**
 * Held names and START_READY candidates that report within `windowDays` of `asOf` (report day included).
 * A held name is flagged as held even when it is also START_READY. A stale date is still flagged and carries `stale`.
 */
export function preEarningsFlags(input: { next: NextEarnings[]; held: string[]; startReady: string[]; windowDays?: number }): PreEarningsFlag[] {
  const window = input.windowDays ?? PRE_EARNINGS_DAYS;
  const held = new Set(input.held);
  const ready = new Set(input.startReady);
  return input.next.flatMap((e): PreEarningsFlag[] => {
    if (e.daysUntil < 0 || e.daysUntil > window) return [];
    const reason = held.has(e.ticker) ? "held" : ready.has(e.ticker) ? "start_ready" : null;
    return reason ? [{ symbol: e.ticker, reason, reportDate: e.reportDate, timeOfDay: e.timeOfDay, daysUntil: e.daysUntil, stale: e.stale }] : [];
  });
}
