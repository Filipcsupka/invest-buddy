import { getPool } from "@/db/pool";
import { storedMacroEvents } from "@/data/macro-calendar-store";

export type EarningsEvent = { ticker: string; date: string; timeOfDay: string | null };
export type CalendarView = { earnings: EarningsEvent[]; macro: { date: string; kind: string; label: string }[] };

/** Upcoming stored dates only. EODHD rows use the same entitlement as the market pages. */
export async function upcomingCalendar(today: string): Promise<CalendarView> {
  const macro = (await storedMacroEvents(today)).filter((event) => event.date >= today).slice(0, 60);
  const db = getPool();
  if (!db || process.env.DATA_MODE === "fixture") return { earnings: [], macro };
  try {
    const result = await db.query<{ ticker: string; date: string; timeOfDay: string | null }>(`
      SELECT ticker, report_date::text AS date, time_of_day AS "timeOfDay"
      FROM (SELECT DISTINCT ON (ticker) ticker, report_date, time_of_day, observed_on
        FROM earnings_calendar_snapshots
        WHERE source_id = 'eodhd' AND observed_on <= $1::date AND observed_on >= $1::date - 14
          AND report_date BETWEEN $1::date AND $1::date + 90
        ORDER BY ticker, observed_on DESC, report_date ASC) latest
      ORDER BY report_date, ticker LIMIT 100`, [today]);
    return { earnings: result.rows, macro };
  } catch {
    return { earnings: [], macro };
  }
}
