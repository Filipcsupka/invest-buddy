import { fill, formatDate, formatNumber, getMessages, type Locale } from "../i18n";
import styles from "./idea-card.module.css";
import type { StoredIdea } from "../db/ideas";

const RATING_KEY = { "Very strong": "Very strong", Strong: "Strong", Good: "Good", Neutral: "Neutral", Weak: "Weak" } as const;

/** One alert in the fixed layout: headline, verdict, what happened, why it matters, setup, numbers, plan, evidence. */
export function IdeaCard({ idea, locale }: { idea: StoredIdea; locale: Locale }) {
  const m = getMessages(locale).ideas;
  const id = `idea-${idea.id}`;
  const headline = fill(m.headline, { symbol: idea.symbol, action: idea.action, min: formatNumber(locale, idea.amountMinEur), max: formatNumber(locale, idea.amountMaxEur) });
  const ratings: [string, keyof typeof idea.setup][] = [[m.company, "company"], [m.entry, "entry"], [m.catalyst, "catalyst"]];
  return (
    <article className={styles.card} aria-labelledby={`${id}-title`} data-action={idea.action}>
      <header className={styles.head}>
        <h2 id={`${id}-title`} className={styles.headline}>{headline}</h2>
        <p className={styles.meta}>
          <span>{fill(m.dated, { date: formatDate(locale, idea.asOf) })}</span>
          {idea.unconfirmed && <span className={`stamp ${styles.flag}`} title={m.unconfirmedNote}>{m.unconfirmed}</span>}
          {idea.conflictNote && <span className={`stamp ${styles.flag}`}>{m.conflict}</span>}
          {idea.downgradedFrom && <span className={`stamp ${styles.flag}`}>{fill(m.downgraded, { action: idea.downgradedFrom })}</span>}
          {idea.carriedFrom && <span className={`stamp ${styles.flag}`} title={m.carriedNote}>{fill(m.carried, { date: formatDate(locale, idea.carriedFrom) })}</span>}
        </p>
        <p className={styles.verdict}>{idea.verdict}</p>
        {idea.conflictNote && <p className={styles.conflict}>{fill(m.conflictLabel, { note: idea.conflictNote })}</p>}
        {idea.unconfirmed && <p className="visually-hidden">{m.unconfirmedNote}</p>}
        {idea.carriedFrom && <p className="visually-hidden">{m.carriedNote}</p>}
      </header>
      <section aria-labelledby={`${id}-happened`}>
        <h3 id={`${id}-happened`} className={styles.label}>{m.whatHappened}</h3>
        <ul className={styles.list}>{idea.whatHappened.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>
      <section aria-labelledby={`${id}-why`}>
        <h3 id={`${id}-why`} className={styles.label}>{m.whyItMatters}</h3>
        <ul className={styles.list}>{idea.whyItMatters.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>
      <section aria-labelledby={`${id}-setup`}>
        <h3 id={`${id}-setup`} className={styles.label}>{m.setup}</h3>
        <dl className={styles.pairs}>
          {ratings.map(([label, key]) => (
            <div key={key} className={styles.pair}>
              <dt>{label}</dt>
              <dd className={styles.rating} data-rating={idea.setup[key]}>{m.ratings[RATING_KEY[idea.setup[key]]]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby={`${id}-numbers`}>
        <h3 id={`${id}-numbers`} className={styles.label}>{m.numbers}</h3>
        <dl className={styles.pairs}>
          {idea.numbers.map((n, i) => <div key={i} className={styles.pair}><dt>{n.label}</dt><dd className="num">{n.value}</dd></div>)}
        </dl>
      </section>
      <section aria-labelledby={`${id}-plan`}>
        <h3 id={`${id}-plan`} className={styles.label}>{m.plan}</h3>
        <dl className={styles.plan}>
          <dt>{m.amountNow}</dt><dd>{idea.plan.amountNow}</dd>
          <dt>{m.trigger}</dt><dd>{idea.plan.trigger}</dd>
          <dt>{m.invalidation}</dt><dd>{idea.plan.invalidation}</dd>
          <dt>{m.opportunityCost}</dt><dd>{idea.plan.opportunityCost}</dd>
        </dl>
      </section>
      {idea.evidence.length > 0 && (
        <section aria-labelledby={`${id}-evidence`}>
          <h3 id={`${id}-evidence`} className={styles.label}>{m.evidence}</h3>
          <ul className={styles.links}>
            {idea.evidence.map((e) => (
              <li key={e.url}>
                <a href={e.url} target="_blank" rel="noopener noreferrer">{e.label}<span className="visually-hidden"> ({m.externalLink})</span></a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className={styles.foot}>{fill(m.model, { model: idea.model })}</p>
    </article>
  );
}
