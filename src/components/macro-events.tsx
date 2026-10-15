import { upcomingMacroEvents } from "@/data/macro-calendar";
import { fill, formatDate, getMessages, type Locale } from "@/i18n";

/** Informational list of the next US data releases and Fed decisions. It never changes a score or a signal. */
export function MacroEvents({ locale, today = new Date().toISOString().slice(0, 10), horizonSessions = 10 }: { locale: Locale; today?: string; horizonSessions?: number }) {
  const m = getMessages(locale).common.macroEvents;
  const events = upcomingMacroEvents(today, horizonSessions);
  if (!events.length) return null;
  return (
    <section className="notice" aria-label={m.title}>
      <h2 className="small" style={{ margin: 0 }}>{m.title}</h2>
      <ul style={{ margin: "var(--s2) 0", paddingLeft: "var(--s5)" }}>
        {events.map((e) => (
          <li key={`${e.date}-${e.kind}`}>
            <strong>{formatDate(locale, e.date)}</strong> {m.kinds[e.kind]} <span className="muted">({e.sessions === 0 ? m.today : fill(m.inSessions, { n: String(e.sessions) })})</span>
          </li>
        ))}
      </ul>
      <p className="muted small" style={{ margin: 0 }}>{m.note}</p>
    </section>
  );
}
