import { fill, formatDate, intlTag, type Locale } from "@/i18n";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import data from "./sec-facts.json";
import w from "./welcome.module.css";
import s from "./story.module.css";

/**
 * "Real filings, plain numbers". The only real figures on the Welcome page: annual revenue as reported on Form 10-K, read from SEC EDGAR
 * companyfacts by scripts/welcome-sec-facts.ts and committed as sec-facts.json. Plain facts with the filing link: no score, no rule
 * state, no colour that could read as good or bad.
 */
export function SecFacts({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).facts;
  const tag = intlTag[locale];
  const money = new Intl.NumberFormat(tag, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const change = new Intl.NumberFormat(tag, { style: "percent", signDisplay: "exceptZero", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <section className={`frame ${w.section}`} aria-labelledby="facts-title">
      <header className={w.head}>
        <div>
          <h2 id="facts-title" className={w.h2}>{t.title}</h2>
          <p className={w.lede}>{t.lede}</p>
        </div>
        <span className={s.realStamp}>{t.stamp}</span>
      </header>
      <div className={`kit-card ${s.facts}`}>
        <table className={s.factTable}>
          <caption className="visually-hidden">{t.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t.colCompany}</th>
              <th scope="col">{t.colRevenue}</th>
              <th scope="col">{t.colChange}</th>
              <th scope="col">{t.colPeriod}</th>
              <th scope="col">{t.colFiling}</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.map((c) => (
              <tr key={c.ticker}>
                <th scope="row">{c.name}<small>{c.ticker}</small></th>
                <td>{money.format(c.revenueUsd)}</td>
                <td data-label={t.colChange}>{change.format(c.yoyPercent / 100)}</td>
                <td data-label={t.colPeriod}>{formatDate(locale, c.periodEnd)}</td>
                <td>
                  <a href={c.filingUrl} rel="noopener">{fill(t.filing, { form: c.form, date: formatDate(locale, c.filed) })}<span className="visually-hidden">, {c.name}</span></a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer className={s.factFoot}>
          <p>{t.note}</p>
          <p>{fill(t.source, { date: formatDate(locale, data.accessed) })}</p>
        </footer>
      </div>
    </section>
  );
}
