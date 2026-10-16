import Link from "next/link";
import type { ReactNode } from "react";
import { Disclaimer } from "@/components/disclaimer";
import { IconArrowRight } from "@/components/icons";
import { LockCard, Reveal, SectionHead, StateChip, TierBadge, TierFrame, type KitState } from "@/components/kit";
import { statusLabel } from "@/components/status-slider";
import { WaitlistForm } from "@/components/waitlist-form";
import { BONUS_RULE_IDS } from "@/engine/display-score";
import { fill, formatDate, formatNumber, getMessages, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { getLandingMessages } from "@/i18n/landing-messages";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { ruleGroups, stateOrder, type StateKey } from "@/i18n/rules";
import styles from "./landing.module.css";

/** Section wrapper: a full-width band with the page frame inside. */
function Band({ id, children, quiet = false }: { id: string; children: ReactNode; quiet?: boolean }) {
  return (
    <section className={quiet ? `${styles.band} ${styles.bandQuiet}` : styles.band} aria-labelledby={id}>
      <div className="frame">{children}</div>
    </section>
  );
}

/** The ten rules as weighted bars, in the three groups of the published method. Widths are the points over the group maximum. */
export function Weights({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getLandingMessages(locale).weights;
  return (
    <Band id="build">
      <SectionHead id="build" title={m.home.buildTitle} lede={m.home.buildBody} meta={<Link className="arrow-link" href={`/${locale}/methodology`}>{t.methodLink}<IconArrowRight /></Link>} />
      <Reveal className={styles.groups}>
        {ruleGroups.map((group) => (
          <section key={group.group} className={styles.group} aria-labelledby={`group-${group.group}`}>
            <h3 id={`group-${group.group}`} className={styles.groupTitle}>
              {m.groups[group.group]}
              <span className={styles.groupMax}>{fill(t.groupPoints, { points: group.max })}</span>
            </h3>
            <ul className={styles.ruleList}>
              {group.rules.map((rule) => (
                <li key={rule.id} className={styles.ruleItem}>
                  <span className={styles.ruleName}>
                    {m.rules[rule.id]}
                    <span className={styles.ruleTag}>{BONUS_RULE_IDS.includes(rule.id) ? t.bonusTag : t.coreTag}</span>
                  </span>
                  <span className={styles.ruleBar} aria-hidden="true">
                    <span style={{ inlineSize: `${(rule.points / group.max) * 100}%` }} />
                  </span>
                  <span className={`${styles.rulePoints} num`}>+{rule.points}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Reveal>
    </Band>
  );
}

const KIT_OF: Record<StateKey, KitState> = { setup: "setup", watch: "watch", wait: "wait", ignore: "ignore", broken: "broken", insufficient: "insufficient" };

/** One row per state with the range it covers and, when the data is live, how many tickers sit there today. */
export function StateLedger({ locale, counts, adviceOutput }: { locale: Locale; counts: Record<StateKey, number> | null; adviceOutput: boolean }) {
  const m = getMessages(locale);
  const t = getLandingMessages(locale).states;
  return (
    <Band id="states" quiet>
      <SectionHead id="states" title={m.home.statusTitle} lede={fill(m.home.statusBody, { setup: statusLabel(m, "setup", adviceOutput) })} rule="quiet" meta={<Link className="arrow-link" href={`/${locale}/methodology#states`}>{t.link}<IconArrowRight /></Link>} />
      <ol className={styles.ledger}>
        {[...stateOrder].map((state) => (
          <li key={state} className={styles.ledgerRow}>
            <span className={styles.ledgerChip}><StateChip state={KIT_OF[state]} label={statusLabel(m, state, adviceOutput)} size="md" /></span>
            <span className={`${styles.ledgerRange} num`}>{m.status.ranges[state]}</span>
            <span className={styles.ledgerMeaning}>{m.status.meaning[state]}</span>
            {counts ? <span className={`${styles.ledgerCount} num`} title={t.countLabel}>{fill(t.count, { n: formatNumber(locale, counts[state]) })}</span> : null}
          </li>
        ))}
      </ol>
    </Band>
  );
}

/** Free and planned paid side by side. Only rendered while the waitlist is open, like the pricing page it links to. */
export function TierSplit({ locale, status }: { locale: Locale; status: ReactNode }) {
  const t = getLandingMessages(locale).tiers;
  const k = getKitMessages(locale);
  const pm = getPricingMessages(locale);
  const lockItems = ["scanner-filters-advanced", "scanner-streak", "csv-export"].map((id) => pm.rows[id as keyof typeof pm.rows]?.label).filter((label): label is string => Boolean(label));
  return (
    <Band id="tiers">
      <SectionHead id="tiers" title={t.title} lede={t.lede} meta={<Link className="arrow-link" href={`/${locale}/pricing`}>{t.link}<IconArrowRight /></Link>} />
      <div className={styles.tiers}>
        <div className={styles.tierFree}>
          <TierBadge tier="free" label={k.tier.free} />
          <h3 className="visually-hidden">{t.freeHeading}</h3>
          <ul className={styles.tierList}>
            {t.free.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <TierFrame badgeLabel={k.tier.paid} note={t.paidHeading} className={styles.tierPaid}>
          <p className={styles.tierNote}>{t.paidNote}</p>
          <LockCard title={t.lockTitle} behindLabel={k.lock.behind} items={lockItems} status={status} statusNote={k.lock.statusKept} badgeLabel={k.tier.paid} />
        </TierFrame>
      </div>
    </Band>
  );
}

export interface LaunchFacts { tickers: number | null; lastScore: string | null; recordStart: string | null }

/** What a visitor can check today: the method, the dated record, the two languages with one rule shown in both. */
export function Proof({ locale, facts }: { locale: Locale; facts: LaunchFacts | null }) {
  const lt = getLaunchMessages(locale).landing;
  const t = getLandingMessages(locale).proof;
  const k = getKitMessages(locale);
  const common = getMessages(locale).common;
  const ratio = (l: Locale) => formatNumber(l, 1.2, 1);
  const sample = (l: Locale) => fill(getMessages(l).ruleThresholds["green-volume"], { ratio: ratio(l) });
  const items = facts
    ? [
        facts.tickers ? fill(lt.factTickers, { n: formatNumber(locale, facts.tickers) }) : null,
        facts.lastScore ? fill(lt.factLastScore, { date: formatDate(locale, facts.lastScore) }) : null,
        facts.recordStart ? fill(lt.factRecordStart, { date: formatDate(locale, facts.recordStart) }) : null,
      ].filter((item): item is string => item !== null)
    : [];
  return (
    <Band id="proof" quiet>
      <SectionHead id="proof" title={lt.proofTitle} rule="quiet" />
      {items.length > 0 ? (
        <>
          <ul className={styles.facts}>{items.map((item) => <li key={item} className="num">{item}</li>)}</ul>
          <Disclaimer text={common.disclaimer} compact />
        </>
      ) : null}
      <div className={styles.proof}>
        <div>
          <h3>{lt.proofMethodTitle}</h3>
          <p>{lt.proofMethodBody}</p>
          <Link className="arrow-link" href={`/${locale}/methodology`}>{lt.proofMethodLink}<IconArrowRight /></Link>
        </div>
        <div>
          <h3>{lt.proofRecordTitle}</h3>
          <p>{lt.proofRecordBody}</p>
          <Link className="arrow-link" href={`/${locale}/track-record`}>{lt.proofRecordLink}<IconArrowRight /></Link>
        </div>
        <div>
          <h3>{t.title}</h3>
          <p>{t.lede}</p>
          <p className={styles.builtFor}>{k.shell.builtFor}</p>
        </div>
      </div>
      <figure className={styles.bilingual}>
        <figcaption>{t.ruleCaption}</figcaption>
        <div className={styles.bilingualGrid}>
          <blockquote lang="en"><span className={styles.lang}>{t.languageEn}</span>{getMessages("en").rules["green-volume"]}: {sample("en")}</blockquote>
          <blockquote lang="sk"><span className={styles.lang}>{t.languageSk}</span>{getMessages("sk").rules["green-volume"]}: {sample("sk")}</blockquote>
        </div>
      </figure>
    </Band>
  );
}

/** Closing row: the waitlist form while it is open, otherwise a link into the screen. */
export function Close({ locale, waitlist, source }: { locale: Locale; waitlist: boolean; source: string }) {
  const m = getMessages(locale);
  const lt = getLaunchMessages(locale).landing;
  const t = getLandingMessages(locale).close;
  return (
    <section className={`${styles.band} ${styles.close}`} aria-labelledby={waitlist ? "waitlist-title" : "close-title"} id={waitlist ? "waitlist" : undefined}>
      <div className={`frame ${styles.closeGrid}`}>
        <div>
          <h2 id={waitlist ? "waitlist-title" : "close-title"} className="kit-section-title">{waitlist ? lt.waitlistTitle : t.title}</h2>
          <p className="prose">{waitlist ? lt.waitlistBody : t.body}</p>
          {!waitlist ? (
            <div className="actions">
              <Link className="button" href={`/${locale}/dashboard`}>{m.home.primary}<IconArrowRight /></Link>
            </div>
          ) : null}
        </div>
        {waitlist ? (
          <div>
            <WaitlistForm locale={locale} labels={m.waitlist} source={source} hideTitle />
            <Disclaimer text={m.common.disclaimer} compact />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** What the screen leaves out and what the record keeps: the two promises about losers and limits. */
export function Promises({ locale, sample }: { locale: Locale; sample: boolean }) {
  const m = getMessages(locale);
  return (
    <Band id="record">
      <SectionHead id="record" title={m.home.recordTitle} meta={<Link className="arrow-link" href={`/${locale}/track-record`}>{m.home.recordLink}<IconArrowRight /></Link>} />
      <div className={styles.promises}>
        <p className="prose">{sample ? m.home.recordSampleBody : m.home.recordBody}</p>
        <div>
          <h3 className={styles.promiseTitle}>{m.home.leavesOutTitle}</h3>
          <p className="prose">{m.home.leavesOutBody}</p>
        </div>
      </div>
    </Band>
  );
}
