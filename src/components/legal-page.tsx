import Link from "next/link";
import { OPERATOR, OPERATOR_FIELDS, operatorIsPlaceholder } from "@/config/operator";
import { fill, type Locale } from "@/i18n";
import { getLegalMessages, LEGAL_SECTION_KEYS } from "@/i18n/legal-messages";

/** Date the legal text was last changed. Bump it with every wording change. */
export const LEGAL_UPDATED = "2026-10-14";

export type LegalDoc = "privacy" | "terms" | "disclaimer";

/** One legal page: eight titled sections, the operator block and, on the privacy page, the contact line. */
export function LegalPage({ locale, doc }: { locale: Locale; doc: LegalDoc }) {
  const t = getLegalMessages(locale);
  const body = t[doc];
  const placeholder = operatorIsPlaceholder();
  const sections = LEGAL_SECTION_KEYS.filter((key) => key in body);
  return (
    <article className="frame page reading">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{body.title}</h1>
          <span className="stamp">{t.common.draft}</span>
        </div>
        <p className="lede">{body.lede}</p>
        <p className="disclaimer">{t.short}</p>
        <p className="prose">{fill(t.common.updated, { date: LEGAL_UPDATED })}</p>
      </header>
      {sections.map((key) => (
        <section key={key} aria-labelledby={`${doc}-${key}`}>
          <h2 id={`${doc}-${key}`}>{(body as Record<string, string>)[`${key}Title`]}</h2>
          <p className="prose">{(body as Record<string, string>)[key]}</p>
        </section>
      ))}
      {doc !== "disclaimer" ? (
        <section aria-labelledby={`${doc}-operator`}>
          <h2 id={`${doc}-operator`}>{t.operator.title}</h2>
          <dl className="prose" data-operator-placeholder={placeholder ? "true" : undefined}>
            {OPERATOR_FIELDS.map((field) => (
              <div key={field}>
                <dt>{t.operator[field]}</dt>
                <dd>{OPERATOR[field]}</dd>
              </div>
            ))}
          </dl>
          {placeholder ? <p className="disclaimer">{t.operator.todo}</p> : null}
          {doc === "privacy" ? (
            <p className="prose">
              {t.common.contactLead} {OPERATOR.contactEmail}
            </p>
          ) : null}
        </section>
      ) : null}
      {doc !== "disclaimer" ? (
        <p className="prose">
          <Link href={`/${locale}/legal/disclaimer`}>{t.common.disclaimerLink}</Link>
        </p>
      ) : null}
    </article>
  );
}
