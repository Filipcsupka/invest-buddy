import { getMessages, type Locale } from "../i18n";
import type { SourceLink } from "./view-model";

/** Where a flag comes from. A link only when the view model gave an https href; third-party data is a plain text label. No sources: "No source yet", muted; `emptyNote` adds what is missing for the catalyst rule. */
export function SourceList({ locale, items, prefix = true, emptyNote }: { locale: Locale; items: SourceLink[]; prefix?: boolean; emptyNote?: boolean }) {
  const m = getMessages(locale).sources;
  if (!items.length) return <span className="src src-none">{prefix ? `${m.label}: ` : ""}{m.none}{emptyNote ? <> · {m.noneCatalyst}</> : null}</span>;
  return (
    <span className="src">
      {prefix && <span className="src-label">{m.label}: </span>}
      {items.map((s, i) => (
        <span key={s.key} className="src-item">
          {s.href ? (
            <a href={s.href} target="_blank" rel="noopener noreferrer">
              {s.label}{s.date && s.dateLabel ? <> <time dateTime={s.date}>{s.dateLabel}</time></> : null}
              <span className="visually-hidden"> ({m.newTab})</span>
            </a>
          ) : (
            <span>{s.label}{s.date && s.dateLabel ? <> <time dateTime={s.date}>{s.dateLabel}</time></> : null}</span>
          )}
          {i < items.length - 1 ? "; " : ""}
        </span>
      ))}
    </span>
  );
}
