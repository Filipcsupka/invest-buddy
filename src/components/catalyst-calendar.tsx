import { SectionHead } from "@/components/kit";
import { CALENDAR_HORIZON_DAYS, daysBetween } from "@/data/catalyst-calendar";
import type { PublicEarningsDate } from "@/data/catalyst-calendar-store";
import { MACRO_EVENT_KINDS, type MacroEvent, type MacroEventKind } from "@/data/macro-calendar";
import { fill, formatDate, getMessages, intlTag, type Locale } from "@/i18n";
import { getCatalystCalendarMessages } from "@/i18n/catalyst-calendar-messages";
import styles from "./macro-events.module.css";

/** Look-ahead for the macro dates on the company page, in calendar days. */
export const MACRO_HORIZON_DAYS = 30;

type Row = { date: string; days: number } & ({ type: "earnings"; timeOfDay: PublicEarningsDate["timeOfDay"] } | { type: "macro"; kind: MacroEventKind });

/**
 * Public dates for the company page: the next official US releases and Fed decisions (BLS and Federal Reserve schedules, display allowed),
 * plus the company's next earnings date when the page passes one (only with PUBLIC_EARNINGS_DATES on). Dates only: no estimate, no rule
 * effect, no action wording. Renders nothing when no date falls in the window.
 */
export function CatalystCalendar({ locale, today, macro, earnings = null, macroHorizonDays = MACRO_HORIZON_DAYS, earningsHorizonDays = CALENDAR_HORIZON_DAYS }: {
  locale: Locale;
  today: string;
  macro: readonly MacroEvent[];
  earnings?: PublicEarningsDate | null;
  macroHorizonDays?: number;
  earningsHorizonDays?: number;
}) {
  const m = getCatalystCalendarMessages(locale);
  const kinds = getMessages(locale).common.macroEvents.kinds;
  const official = new Set<string>(MACRO_EVENT_KINDS);
  const rows: Row[] = [];
  for (const event of macro) {
    const days = daysBetween(today, event.date);
    if (official.has(event.kind) && days >= 0 && days <= macroHorizonDays) rows.push({ type: "macro", date: event.date, days, kind: event.kind as MacroEventKind });
  }
  const earningsDays = earnings ? daysBetween(today, earnings.date) : -1;
  if (earnings && earningsDays >= 0 && earningsDays <= earningsHorizonDays) rows.push({ type: "earnings", date: earnings.date, days: earningsDays, timeOfDay: earnings.timeOfDay });
  if (!rows.length) return null;
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === "earnings" ? -1 : 1) || (a.type === "macro" && b.type === "macro" ? a.kind.localeCompare(b.kind) : 0));

  const part = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlTag[locale], { ...options, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const relative = (days: number) => days === 0 ? m.today : days === 1 ? m.tomorrow : fill(days <= 4 ? m.inDaysFew : m.inDays, { n: days });
  const sources = [rows.some((row) => row.type === "macro") ? m.macroSource : "", rows.some((row) => row.type === "earnings") ? m.earningsSource : ""].filter(Boolean).join(" ");
  return (
    <section className="co-card co-calendar" aria-labelledby="calendar" data-catalyst-calendar="">
      <SectionHead id="calendar" title={m.title} lede={m.note} rule="quiet" />
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={`${row.date}-${row.type === "macro" ? row.kind : "earnings"}`} className={styles.item} data-kind={row.type === "macro" ? row.kind : "earnings"}>
            <span className={styles.date} aria-hidden="true"><span className={styles.day}>{part(row.date, { day: "numeric" })}</span><span className={styles.month}>{part(row.date, { month: "short" })}</span></span>
            <span className={styles.what}>
              <span className={styles.kind}>{row.type === "macro" ? kinds[row.kind] : m.earnings}</span>
              <span className={styles.when}>
                <time dateTime={row.date}>{formatDate(locale, row.date)}</time> ({relative(row.days)}){row.type === "earnings" && row.timeOfDay ? `, ${m.timeOfDay[row.timeOfDay]}` : null}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{sources}</p>
    </section>
  );
}
