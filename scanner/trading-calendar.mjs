// NYSE trading calendar, static data. Shared by the web/jobs code (via src/data/trading-calendar.ts) and the scanner image.
// Source: https://www.nyse.com/trade/hours-calendars, checked 2026-10-10. The page lists 2026 to 2028; 2027 below matches it.
// TODO verify: the page no longer lists 2025, so the 2025 rows are not re-checked against it.
// Re-verify each December. The calendar ends 2027-12-31; extend it before then (D16 adds a check).

/** Full-day closures, including observed dates. */
export const NYSE_HOLIDAYS = [
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
];
/** Sessions that close at 13:00 New York time. */
export const NYSE_EARLY_CLOSES = ["2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26"];
export const CALENDAR_FIRST_DAY = "2025-01-01";
export const CALENDAR_LAST_DAY = "2027-12-31";

const holidays = new Set(NYSE_HOLIDAYS);
const earlyCloses = new Set(NYSE_EARLY_CLOSES);

function parse(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(+d) || d.toISOString().slice(0, 10) !== date) throw new Error(`Invalid date ${date}`);
  return d;
}
function iso(d) { return d.toISOString().slice(0, 10); }
function inRange(date) { return date >= CALENDAR_FIRST_DAY && date <= CALENDAR_LAST_DAY; }

/** True when NYSE trades on the date. Outside the covered years it throws instead of guessing. */
export function isSession(date) {
  const d = parse(date);
  if (!inRange(date)) throw new Error(`${date} is outside the trading calendar (${CALENDAR_FIRST_DAY} to ${CALENDAR_LAST_DAY})`);
  return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && !holidays.has(date);
}
export function isEarlyClose(date) { return isSession(date) && earlyCloses.has(date); }

/** Sessions from `from` to `to`, both inclusive. */
export function sessionsBetween(from, to) {
  const out = [];
  const end = parse(to);
  for (const d = parse(from); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (isSession(iso(d))) out.push(iso(d));
  return out;
}

/** The last session strictly before the date. */
export function previousSession(date) {
  const d = parse(date);
  do { d.setUTCDate(d.getUTCDate() - 1); } while (!isSession(iso(d)));
  return iso(d);
}

/** The last session on or before the date. */
export function lastSessionOnOrBefore(date) {
  return isSession(date) ? date : previousSession(date);
}

/** The last completed session in New York: today's once the 16:30 local mark has passed (half days included), else the one before. Falls back to weekday logic outside the calendar years. */
export function lastCompletedSession(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const afterClose = +parts.hour * 60 + +parts.minute >= 16 * 60 + 30;
  if (!inRange(today) || !inRange(iso(new Date(Date.parse(`${today}T00:00:00Z`) - 10 * 86_400_000)))) {
    const d = parse(today);
    const weekday = (x) => x.getUTCDay() >= 1 && x.getUTCDay() <= 5;
    if (!(weekday(d) && afterClose)) d.setUTCDate(d.getUTCDate() - 1);
    while (!weekday(d)) d.setUTCDate(d.getUTCDate() - 1);
    return iso(d);
  }
  return afterClose && isSession(today) ? today : previousSession(today);
}
