import Link from "next/link";
import type { ReactNode } from "react";
import { DataStatus } from "@/components/data-status";
import { Disclaimer } from "@/components/disclaimer";
import { IconArrowRight } from "@/components/icons";
import { Reveal, ResultMark, ScoreBar, ScoreDial, StateChip, TierBadge, type KitState } from "@/components/kit";
import { SampleStamp } from "@/components/operator-disclosure";
import { statusLabel } from "@/components/status-slider";
import { WaitlistForm } from "@/components/waitlist-form";
import type { ScoreResult } from "@/engine";
import { fill, formatDate, formatNumber, getMessages, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { getLandingMessages } from "@/i18n/landing-messages";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { ruleGroups, stateOrder, type StateKey } from "@/i18n/rules";
import { LIVE_PAID, paidIds } from "./tier-rows";
import styles from "./landing.module.css";

/** Section wrapper with a heading block: title and lede on the left, one link on the right. */
function Section({ id, title, lede, link, children, tone }: { id: string; title: string; lede?: string; link?: ReactNode; children: ReactNode; tone?: "navy" }) {
  return (
    <section className={tone === "navy" ? `${styles.section} ${styles.sectionNavy}` : styles.section} aria-labelledby={id} data-tone={tone}>
      <div className={tone === "navy" ? styles.navyPanel : "frame"}>
        <header className={styles.secHead}>
          <div>
            <h2 id={id} className={styles.secTitle}>{title}</h2>
            {lede ? <p className={styles.secLede}>{lede}</p> : null}
          </div>
          {link}
        </header>
        {children}
      </div>
    </section>
  );
}

const arrow = (href: string, label: string) => <Link className="arrow-link" href={href}>{label}<IconArrowRight /></Link>;

export interface BoardRow { ticker: string; name: string; percent: number | null; state: KitState; label: string; href: string }

/** Hero: a navy panel with the headline and one call to action on the left and the ranked list on the right. */
export function Hero({ locale, rows, total, sample, waitlist, lastUpdated, stale }: { locale: Locale; rows: BoardRow[]; total: number; sample: boolean; waitlist: boolean; lastUpdated: string | null; stale: boolean }) {
  const m = getMessages(locale);
  const t = getLandingMessages(locale).hero;
  const lt = getLaunchMessages(locale).landing;
  const dis = "board-disclaimer";
  return (
    <section className={`frame ${styles.hero}`} aria-label={m.home.title}>
      <div className={styles.heroPanel}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>{m.home.title}</h1>
          <p className={styles.heroLede}>{m.home.lede}</p>
          <div className={styles.heroActions}>
            <Link className="button cta" href={`/${locale}/dashboard`}>
              {m.home.primary}
              <IconArrowRight />
            </Link>
            <Link className={styles.ghostLink} href={waitlist ? "#waitlist" : `/${locale}/methodology`}>
              {waitlist ? lt.ctaWaitlist : m.home.secondary}
            </Link>
          </div>
          <ul className={styles.heroNotes}>
            {[t.noteFree, t.noteRules, t.noteMisses].map((note) => (
              <li key={note}><span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span>{note}</li>
            ))}
          </ul>
          <div className={styles.heroStatus}><DataStatus locale={locale} lastUpdated={lastUpdated} stale={stale} /></div>
        </div>
        {rows.length > 0 ? (
          <div className={styles.board} role="group" aria-labelledby="board-title">
            <header className={styles.boardHead}>
              <h2 id="board-title" className={styles.boardTitle}>{sample ? t.boardSample : t.boardTitle}</h2>
              {sample ? <SampleStamp text={m.common.sample} /> : null}
            </header>
            <ol className={styles.boardList}>
              {rows.map((row, i) => (
                <li key={row.ticker}>
                  <Link className={styles.boardRow} href={row.href}>
                    <span className={`${styles.rank} num`}>{i + 1}</span>
                    <span className={styles.boardName}>
                      <span className={styles.boardTicker}>{row.ticker}</span>
                      <span className={styles.boardCompany}>{row.name}</span>
                    </span>
                    <span className={styles.boardBar}><ScoreBar percent={row.percent} state={row.state} stateLabel={row.label} locale={locale} label={t.colScore} describedBy={dis} size="sm" motion="load" /></span>
                    <StateChip state={row.state} label={row.label} size="sm" describedBy={dis} />
                  </Link>
                </li>
              ))}
            </ol>
            <footer className={styles.boardFoot}>
              <Disclaimer id={dis} text={m.common.disclaimer} compact />
              {arrow(`/${locale}/dashboard`, fill(t.all, { n: formatNumber(locale, total) }))}
            </footer>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface Specimen { ticker: string; result: ScoreResult; percent: number | null; state: KitState; label: string; known: number; total: number; met: number }

/** How a score is built: three step cards. The rule rows and the dial read the top ticker, so the example is real data. */
export function Steps({ locale, specimen }: { locale: Locale; specimen: Specimen | null }) {
  const m = getMessages(locale);
  const t = getLandingMessages(locale).steps;
  const k = getKitMessages(locale);
  const rules = ruleGroups.flatMap((group) => group.rules);
  const hits = new Map((specimen?.result.ruleHits ?? []).map((hit) => [hit.id, hit]));
  const shown = [rules[0], rules[1], rules[4], rules[5], rules[8]].filter((rule): rule is (typeof rules)[number] => Boolean(rule));
  return (
    <Section id="build" title={m.home.buildTitle} lede={m.home.buildBody} link={arrow(`/${locale}/methodology`, getLandingMessages(locale).weights.methodLink)}>
      <Reveal as="ol" className={styles.steps}>
        <li className={`kit-card ${styles.step}`}>
          <p className={styles.stepNo}>{fill(t.label, { n: 1 })}</p>
          <h3>{t.one.title}</h3>
          <p className={styles.stepBody}>{t.one.body}</p>
          <ul className={styles.groupBars}>
            {ruleGroups.map((group) => (
              <li key={group.group}>
                <span className={styles.groupName}>{m.groups[group.group]}</span>
                <span className={styles.groupTrack} aria-hidden="true"><span style={{ inlineSize: `${(group.max / 10) * 100}%` }} /></span>
                <span className={`${styles.groupPts} num`}>{fill(getLandingMessages(locale).weights.groupPoints, { points: group.max })}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className={`kit-card ${styles.step}`}>
          <p className={styles.stepNo}>{fill(t.label, { n: 2 })}</p>
          <h3>{fill(t.two.title, { n: rules.length })}</h3>
          <p className={styles.stepBody}>{t.two.body}</p>
          <ul className={styles.miniRules}>
            {shown.map((rule) => {
              const hit = hits.get(rule.id);
              const result = !hit || hit.unknown ? "none" : hit.matched ? "pass" : "fail";
              const points = result === "pass" ? fill(k.rule.pointsOf, { points: rule.points, max: rule.points }) : result === "fail" ? fill(k.rule.pointsNone, { max: rule.points }) : t.noData;
              return (
                <li key={rule.id} data-result={result}>
                  <span className="kit-mark" data-result={result}><ResultMark result={result} /></span>
                  <span className={styles.miniName}>{m.rules[rule.id]}</span>
                  <span className={`${styles.miniPts} num`}>{points}</span>
                </li>
              );
            })}
          </ul>
          <p className={styles.more}>{fill(t.more, { n: rules.length - shown.length })}</p>
        </li>
        <li className={`kit-card ${styles.step}`}>
          <p className={styles.stepNo}>{fill(t.label, { n: 3 })}</p>
          <h3>{t.three.title}</h3>
          <p className={styles.stepBody}>{t.three.body}</p>
          {specimen ? (
            <div className={styles.stepResult}>
              <ScoreDial percent={specimen.percent} state={specimen.state} stateLabel={specimen.label} locale={locale} motion="view" size="md" />
              <div className={styles.stepSide}>
                <StateChip state={specimen.state} label={specimen.label} size="md" />
                <p className={styles.small}>{fill(m.status.rulesMet, { met: specimen.met, total: specimen.total })}</p>
                <p className={styles.small}>{specimen.ticker}</p>
              </div>
            </div>
          ) : null}
        </li>
      </Reveal>
    </Section>
  );
}

const KIT_OF: Record<StateKey, KitState> = { setup: "setup", watch: "watch", wait: "wait", ignore: "ignore", broken: "broken", insufficient: "insufficient" };

/** Six state cards: the chip, the range it covers, the plain meaning and, on live data, how many tickers sit there today. */
export function StateBoard({ locale, counts, adviceOutput }: { locale: Locale; counts: Record<StateKey, number> | null; adviceOutput: boolean }) {
  const m = getMessages(locale);
  const t = getLandingMessages(locale).states;
  return (
    <Section id="states" title={m.home.statusTitle} lede={fill(m.home.statusBody, { setup: statusLabel(m, "setup", adviceOutput) })} link={arrow(`/${locale}/methodology#states`, t.link)}>
      <Reveal as="ul" className={styles.stateGrid}>
        {[...stateOrder].map((state) => (
          <li key={state} className={`kit-card ${styles.stateCard}`} data-state={state}>
            <div className={styles.stateTop}>
              <StateChip state={KIT_OF[state]} label={statusLabel(m, state, adviceOutput)} size="md" />
              {counts ? <span className={`${styles.stateCount} num`} title={t.countLabel}>{fill(t.count, { n: formatNumber(locale, counts[state]) })}</span> : null}
            </div>
            <p className={`${styles.stateRange} num`}>{m.status.ranges[state]}</p>
            <p className={styles.stateMeaning}>{m.status.meaning[state]}</p>
          </li>
        ))}
      </Reveal>
    </Section>
  );
}

/** Free and planned paid side by side, from the same tier config as the pricing table. Rendered only while the waitlist is open. */
export function TierSplit({ locale }: { locale: Locale }) {
  const t = getLandingMessages(locale).tiers;
  const k = getKitMessages(locale);
  const pm = getPricingMessages(locale);
  const ids = paidIds(Object.keys(pm.rows)).slice(0, 6);
  return (
    <Section id="tiers" title={t.title} lede={t.lede} link={arrow(`/${locale}/pricing`, t.link)}>
      <Reveal className={styles.tiers}>
        <article className={`kit-card ${styles.tierCard}`}>
          <header className={styles.tierHead}>
            <TierBadge tier="free" label={k.tier.free} />
            <h3>{t.freeHeading}</h3>
          </header>
          <ul className={styles.tierList}>
            {t.free.map((item) => <li key={item}><span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span>{item}</li>)}
          </ul>
        </article>
        <article className={`kit-card ${styles.tierCard} ${styles.tierPaid}`}>
          <header className={styles.tierHead}>
            <TierBadge tier="paid" label={k.tier.paid} />
            <h3>{t.paidHeading}</h3>
          </header>
          <p className={styles.tierNote}>{t.paidNote}</p>
          <ul className={styles.tierList}>
            {ids.map((id) => (
              <li key={id}>
                <span className={styles.lockDot} aria-hidden="true" />
                <span>{pm.rows[id]?.label}</span>
                <span className={styles.tierState} data-live={LIVE_PAID.has(id) ? "" : undefined}>{LIVE_PAID.has(id) ? pm.statusLive : pm.statusPlanned}</span>
              </li>
            ))}
          </ul>
        </article>
      </Reveal>
    </Section>
  );
}

export interface LaunchFacts { tickers: number | null; lastScore: string | null; recordStart: string | null }

/** The proof band on navy: working shown, misses kept, two languages. The facts row only appears for live data. */
export function Proof({ locale, facts }: { locale: Locale; facts: LaunchFacts | null }) {
  const m = getMessages(locale);
  const lt = getLaunchMessages(locale).landing;
  const t = getLandingMessages(locale);
  const k = getKitMessages(locale);
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
    <Section id="proof" title={lt.proofTitle} tone="navy">
      {items.length > 0 ? <ul className={styles.facts}>{items.map((item) => <li key={item} className="num">{item}</li>)}</ul> : null}
      <div className={styles.proof}>
        <article className={styles.proofCard}>
          <h3>{t.working.title}</h3>
          <p>{t.working.body}</p>
          {arrow(`/${locale}/methodology`, lt.proofMethodLink)}
        </article>
        <article className={styles.proofCard}>
          <h3>{lt.proofRecordTitle}</h3>
          <p>{lt.proofRecordBody}</p>
          {arrow(`/${locale}/track-record`, lt.proofRecordLink)}
        </article>
        <article className={styles.proofCard}>
          <h3>{t.proof.title}</h3>
          <p>{t.proof.lede}</p>
          <p className={styles.builtFor}>{k.shell.builtFor}</p>
        </article>
      </div>
      <figure className={styles.bilingual}>
        <figcaption>{t.proof.ruleCaption}</figcaption>
        <div className={styles.bilingualGrid}>
          <blockquote lang="en"><span className={styles.lang}>{t.proof.languageEn}</span>{getMessages("en").rules["green-volume"]}: {sample("en")}</blockquote>
          <blockquote lang="sk"><span className={styles.lang}>{t.proof.languageSk}</span>{getMessages("sk").rules["green-volume"]}: {sample("sk")}</blockquote>
        </div>
      </figure>
      <div className={styles.leaves}>
        <h3>{m.home.leavesOutTitle}</h3>
        <p>{m.home.leavesOutBody}</p>
      </div>
    </Section>
  );
}

/** Closing card: the waitlist form while it is open, otherwise a link into the screen. */
export function Close({ locale, waitlist, source }: { locale: Locale; waitlist: boolean; source: string }) {
  const m = getMessages(locale);
  const lt = getLaunchMessages(locale).landing;
  const t = getLandingMessages(locale).close;
  const id = waitlist ? "waitlist-title" : "close-title";
  return (
    <section className={`frame ${styles.close}`} aria-labelledby={id} id={waitlist ? "waitlist" : undefined}>
      <div className={`kit-card ${styles.closeCard}`}>
        <div className={styles.closeCopy}>
          <h2 id={id} className={styles.secTitle}>{waitlist ? lt.waitlistTitle : t.title}</h2>
          <p className={styles.secLede}>{waitlist ? lt.waitlistBody : t.body}</p>
          {!waitlist ? (
            <div className="actions">
              <Link className="button cta" href={`/${locale}/dashboard`}>{m.home.primary}<IconArrowRight /></Link>
            </div>
          ) : null}
        </div>
        {waitlist ? (
          <div className={styles.closeForm}>
            <WaitlistForm locale={locale} labels={m.waitlist} source={source} hideTitle />
            <Disclaimer text={m.common.disclaimer} compact />
          </div>
        ) : null}
      </div>
    </section>
  );
}
