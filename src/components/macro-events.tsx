import { upcomingMacroEvents } from "@/data/macro-calendar";
import { fill, formatDate, getMessages, intlTag, type Locale } from "@/i18n";
import styles from "./macro-events.module.css";

const calendar = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.75v2.5M10.5 1.75v2.5" />
  </svg>
);

/** Informational list of the next US data releases and Fed decisions. It never changes a score or a signal. */
export function MacroEvents({ locale, today = new Date().toISOString().slice(0, 10), horizonSessions = 10 }: { locale: Locale; today?: string; horizonSessions?: number }) {
  const m = getMessages(locale).common.macroEvents;
  const events = upcomingMacroEvents(today, horizonSessions);
  if (!events.length) return null;
  const part = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlTag[locale], { ...options, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <section className={styles.card} aria-label={m.title}>
      <div className={styles.head}><span className={styles.headIcon}>{calendar}</span><h2 className={styles.title}>{m.title}</h2></div>
      <ul className={styles.list}>
        {events.map((e) => (
          <li key={`${e.date}-${e.kind}`} className={styles.item}>
            <span className={styles.date} aria-hidden="true"><span className={styles.day}>{part(e.date, { day: "numeric" })}</span><span className={styles.month}>{part(e.date, { month: "short" })}</span></span>
            <span className={styles.what}>
              <span className={styles.kind}>{m.kinds[e.kind]}</span>
              <span className={styles.when}><time dateTime={e.date}>{formatDate(locale, e.date)}</time> ({e.sessions === 0 ? m.today : fill(m.inSessions, { n: String(e.sessions) })})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{m.note}</p>
    </section>
  );
}
