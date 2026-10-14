import Link from "next/link";
import { Disclaimer } from "@/components/disclaimer";
import { WaitlistForm } from "@/components/waitlist-form";
import type { PriceVariantId } from "@/config/plans";
import { fill, formatDate, formatNumber, getMessages, type Locale } from "@/i18n";
import { getLaunchMessages } from "@/i18n/launch-messages";
import styles from "./launch.module.css";

export interface LaunchFacts {
  tickers: number | null;
  lastScore: string | null;
  recordStart: string | null;
}

/** Waitlist section for the landing page. Facts are shown only when the site can back them. */
export function LaunchSection({ locale, facts, variant, source }: { locale: Locale; facts: LaunchFacts; variant: PriceVariantId; source: string }) {
  const t = getLaunchMessages(locale);
  const common = getMessages(locale).common;
  const items = [
    facts.tickers ? fill(t.landing.factTickers, { n: formatNumber(locale, facts.tickers) }) : null,
    facts.lastScore ? fill(t.landing.factLastScore, { date: formatDate(locale, facts.lastScore) }) : null,
    facts.recordStart ? fill(t.landing.factRecordStart, { date: formatDate(locale, facts.recordStart) }) : null,
  ].filter((item): item is string => item !== null);
  return (
    <>
      <section className="frame ledger" aria-labelledby="waitlist-title" id="waitlist">
        <div className="ledger-head">
          <h2 id="waitlist-title">{t.landing.waitlistTitle}</h2>
          <p className="prose">{t.landing.waitlistBody}</p>
        </div>
        <div>
          <WaitlistForm locale={locale} labels={getMessages(locale).waitlist} source={source} priceVariant={variant} hideTitle />
          <Disclaimer text={common.disclaimer} compact />
        </div>
      </section>

      <section className="frame ledger ledger-quiet" aria-labelledby="proof">
        <div className="ledger-head">
          <h2 id="proof">{t.landing.proofTitle}</h2>
          {items.length > 0 ? (
            <ul className={styles.facts}>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {items.length > 0 ? <Disclaimer text={common.disclaimer} compact /> : null}
        </div>
        <div className={styles.proof}>
          <div>
            <h3>{t.landing.proofMethodTitle}</h3>
            <p>{t.landing.proofMethodBody}</p>
            <Link href={`/${locale}/methodology`}>{t.landing.proofMethodLink}</Link>
          </div>
          <div>
            <h3>{t.landing.proofRecordTitle}</h3>
            <p>{t.landing.proofRecordBody}</p>
            <Link href={`/${locale}/track-record`}>{t.landing.proofRecordLink}</Link>
          </div>
          <div>
            <h3>{t.landing.proofSlovakTitle}</h3>
            <p>{t.landing.proofSlovakBody}</p>
          </div>
        </div>
      </section>

      <section className="frame ledger ledger-quiet" aria-labelledby="tiers">
        <div className="ledger-head">
          <h2 id="tiers">{t.landing.tiersTitle}</h2>
        </div>
        <div>
          <p className="prose">{t.landing.tiersBody}</p>
          <div className="actions">
            <Link className="button secondary" href={`/${locale}/pricing`}>
              {t.landing.tiersLink}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
