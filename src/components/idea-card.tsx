import { fill, formatDate, formatNumber, getMessages, type Locale } from "../i18n";
import styles from "./idea-card.module.css";
import type { StoredIdea } from "../db/ideas";
import { hasBuySize, publicTier, stripEur } from "../ideas/public";
import { localizeCodes, localizeEvidenceLabel } from "../ideas/localize";
import { flags } from "../config/flags";
import { AdrLine } from "./disclaimer";

const RATING_KEY = { "Very strong": "Very strong", Strong: "Strong", Good: "Good", Neutral: "Neutral", Weak: "Weak" } as const;
const PUBLIC_SOURCE_LABEL = /^(?:Sample )?(?:Earnings release|Výsledková správa|10-[QK]|8-K|Form [345]|Proxy statement|Annual report|Quarterly report|Press release|Tlačová správa)$/i;

/**
 * One alert in the fixed layout: headline, verdict, what happened, why it matters, setup, numbers, plan, evidence.
 * Public callers set showAmounts false. The legal flag reduces the card to rule state and evidence.
 */
export function IdeaCard({ idea: stored, locale, showAmounts = false, nested = false, stateLabel }: { idea: StoredIdea; locale: Locale; showAmounts?: boolean; nested?: boolean; stateLabel?: string }) {
  const m = getMessages(locale).ideas;
  if (!flags().ADVICE_OUTPUT) {
    const H = nested ? "h3" : "h2";
    return <article className={styles.card} aria-labelledby={`idea-${stored.id}-title`}>
      <H id={`idea-${stored.id}-title`} className={styles.headline}>{stored.symbol}{stateLabel ? ` · ${stateLabel}` : ""}</H>
      {stored.evidence.length > 0 && <section aria-label={m.evidence}>
        <ul className={styles.links}>{stored.evidence.map((item, index) => {
          const translated = locale === "sk" ? stored.translations?.sk?.evidence.find((source) => source.url === item.url)?.label : undefined;
          const label = localizeEvidenceLabel(locale, translated ?? item.label);
          const source = PUBLIC_SOURCE_LABEL.test(label) ? label : `${m.evidence} ${index + 1}`;
          return <li key={item.url}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">{source} · {new URL(item.url).hostname.replace(/^www\./, "")}</a>
          </li>;
        })}</ul>
      </section>}
    </article>;
  }
  // ADR-001: public callers omit the owner's EUR amount and band.
  const translated = locale === "sk" ? stored.translations?.sk : undefined;
  const selected = translated ? { ...stored, ...translated, conflictNote: translated.conflictNote ?? translated.conflictReason ?? stored.conflictNote, plan: { ...stored.plan, ...translated.plan } } : stored;
  const stripped = showAmounts ? selected : stripEur(selected);
  const textLocale: Locale = translated ? locale : "en";
  const t = (value: string) => localizeCodes(textLocale, value);
  const idea = {
    ...stripped,
    verdict: t(stripped.verdict),
    whatHappened: stripped.whatHappened.map(t),
    whyItMatters: stripped.whyItMatters.map(t),
    conflictNote: stripped.conflictNote ? t(stripped.conflictNote) : stripped.conflictNote,
    plan: { ...stripped.plan, trigger: t(stripped.plan.trigger), invalidation: t(stripped.plan.invalidation), opportunityCost: t(stripped.plan.opportunityCost) },
  };
  const englishFallback = locale !== "en" && (!translated || Boolean(stored.conflictNote && translated.conflictNote == null && translated.conflictReason == null) || Boolean(stored.downgradedFrom && stored.translations?.en?.downgradeReason && !translated.downgradeReason));
  const H = nested ? "h3" : "h2";
  const L = nested ? "h4" : "h3";
  const id = `idea-${idea.id}`;
  const tier = publicTier(idea);
  const action = m.actions[idea.action];
  const headline = showAmounts
    ? fill(m.headline, { symbol: idea.symbol, action, min: formatNumber(locale, idea.amountMinEur), max: formatNumber(locale, idea.amountMaxEur) })
    : tier && idea.action === "ADD" && (tier === "ADD_THIRD" || tier === "ADD_HALF") ? fill(m.headlinePublic, { symbol: idea.symbol, action: m.tiersShort[tier] })
    : hasBuySize(tier) ? fill(m.headlineTier, { symbol: idea.symbol, action, size: m.tiersShort[tier] }) : fill(m.headlinePublic, { symbol: idea.symbol, action });
  const ratings: [string, keyof typeof idea.setup][] = [[m.company, "company"], [m.entry, "entry"], [m.catalyst, "catalyst"]];
  return (
    <article className={styles.card} aria-labelledby={`${id}-title`} data-action={idea.action}>
      <header className={styles.head}>
        <H id={`${id}-title`} className={styles.headline}>{headline}</H>
        <p className={styles.meta}>
          <span>{fill(m.dated, { date: formatDate(locale, idea.asOf) })}</span>
          {englishFallback && <span className={`stamp ${styles.flag}`}>{m.shownInEnglish}</span>}
          {idea.unconfirmed && <span className={`stamp ${styles.flag}`} title={m.unconfirmedNote}>{m.unconfirmed}</span>}
          {idea.conflictNote && <span className={`stamp ${styles.flag}`}>{m.conflict}</span>}
          {idea.downgradedFrom && <span className={`stamp ${styles.flag}`}>{fill(m.downgraded, { action: m.actions[idea.downgradedFrom] })}</span>}
          {idea.carriedFrom && <span className={`stamp ${styles.flag}`} title={m.carriedNote}>{fill(m.carried, { date: formatDate(locale, idea.carriedFrom) })}</span>}
        </p>
        {idea.verdict && <p className={styles.verdict}>{idea.verdict}</p>}
        {idea.conflictNote && <p className={styles.conflict}>{fill(m.conflictLabel, { note: idea.conflictNote })}</p>}
        {idea.downgradedFrom && (locale === "sk" ? selected.translations?.sk?.downgradeReason ?? selected.translations?.en?.downgradeReason : selected.translations?.en?.downgradeReason) && <p className={styles.conflict}>{locale === "sk" ? selected.translations?.sk?.downgradeReason ?? selected.translations?.en?.downgradeReason : selected.translations?.en?.downgradeReason}</p>}
        {idea.unconfirmed && <p className="visually-hidden">{m.unconfirmedNote}</p>}
        {idea.carriedFrom && <p className="visually-hidden">{m.carriedNote}</p>}
      </header>
      {idea.whatHappened.length > 0 && <section aria-labelledby={`${id}-happened`}>
        <L id={`${id}-happened`} className={styles.label}>{m.whatHappened}</L>
        <ul className={styles.list}>{idea.whatHappened.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>}
      {idea.whyItMatters.length > 0 && <section aria-labelledby={`${id}-why`}>
        <L id={`${id}-why`} className={styles.label}>{m.whyItMatters}</L>
        <ul className={styles.list}>{idea.whyItMatters.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>}
      <section aria-labelledby={`${id}-setup`}>
        <L id={`${id}-setup`} className={styles.label}>{m.setup}</L>
        <dl className={styles.pairs}>
          {ratings.map(([label, key]) => (
            <div key={key} className={styles.pair}>
              <dt>{label}</dt>
              <dd className={styles.rating} data-rating={idea.setup[key]}>{m.ratings[RATING_KEY[idea.setup[key]]]}</dd>
            </div>
          ))}
        </dl>
      </section>
      {idea.numbers.length > 0 && <section aria-labelledby={`${id}-numbers`}>
        <L id={`${id}-numbers`} className={styles.label}>{m.numbers}</L>
        <dl className={styles.pairs}>
          {idea.numbers.map((n, i) => <div key={i} className={styles.pair}><dt>{n.label}</dt><dd className="num">{n.value}</dd></div>)}
        </dl>
      </section>}
      {(showAmounts || tier || idea.plan.trigger || idea.plan.invalidation || idea.plan.opportunityCost) && <section aria-labelledby={`${id}-plan`}>
        <L id={`${id}-plan`} className={styles.label}>{m.plan}</L>
        <dl className={styles.plan}>
          {tier && <><dt>{m.size}</dt><dd data-tier={tier}>{m.tiers[tier]}<span className="muted small"> {m.sizeNote}</span></dd></>}
          {showAmounts && <><dt>{m.amountNow}</dt><dd>{idea.plan.amountNow}</dd></>}
          {idea.plan.trigger && <><dt>{m.trigger}</dt><dd>{idea.plan.trigger}</dd></>}
          {idea.plan.invalidation && <><dt>{m.invalidation}</dt><dd>{idea.plan.invalidation}</dd></>}
          {idea.plan.opportunityCost && <><dt>{m.opportunityCost}</dt><dd>{idea.plan.opportunityCost}</dd></>}
        </dl>
      </section>}
      {idea.evidence.length > 0 && (
        <section aria-labelledby={`${id}-evidence`}>
          <L id={`${id}-evidence`} className={styles.label}>{m.evidence}</L>
          <ul className={styles.links}>
            {idea.evidence.map((e) => (
              <li key={e.url}>
                <a href={e.url} target="_blank" rel="noopener noreferrer">{localizeEvidenceLabel(textLocale, e.label)}<span className="visually-hidden"> ({m.externalLink})</span></a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AdrLine text={getMessages(locale).common.disclaimer} />
      <p className={styles.foot}>{fill(m.model, { model: idea.model })}</p>
    </article>
  );
}
