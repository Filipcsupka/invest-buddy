import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthDialogLink } from "@/components/auth/auth-dialog";
import { Disclaimer } from "@/components/disclaimer";
import { IconArrowRight } from "@/components/icons";
import { ResultMark, ScoreBar, StateChip, kitState } from "@/components/kit";
import { SampleStamp } from "@/components/operator-disclosure";
import { PlusLock } from "@/components/paywall/lock-card";
import { DATA_SOURCES } from "@/data/sources-registry";
import { CORE_RULES } from "@/engine/display-score";
import { RELATIVE_RULES } from "@/engine/relative";
import { fill, formatScorePercent, getMessages, plural, type Locale } from "@/i18n";
import { TIER_LIMITS } from "@/config/tiers";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { ruleGroups, type RuleId, type StateKey } from "@/i18n/rules";
import { getWelcomeMessages } from "@/i18n/welcome-messages";
import { PLUS_PRICE, formatEur, yearlyPerMonth } from "@/app/[locale]/pricing/plans";
import { SAMPLE_HISTORY_DAYS, sampleRows, specimenRow, type SampleRow } from "./sample-data";
import { SignedInSwap } from "./signed-in-swap";
import styles from "./welcome.module.css";

const pct = (locale: Locale, n: number) => formatScorePercent(locale, n);
const label = (locale: Locale, state: StateKey, pullback = false) => (pullback ? getMessages(locale).states.pullback : getMessages(locale).states[state]);

function SectionHead({ id, title, lede, link }: { id: string; title: string; lede?: string; link?: ReactNode }) {
  return (
    <header className={styles.head}>
      <div>
        <h2 id={id} className={styles.h2} data-w="reveal">{title}</h2>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
      </div>
      {link}
    </header>
  );
}

const arrow = (href: string, text: string) => <Link className="arrow-link" href={href}>{text}<IconArrowRight /></Link>;

/* ---------- 1. Hero ---------- */

export function WelcomeHero({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeMessages(locale).hero;
  const rows = sampleRows().slice(0, 5);
  const dis = "welcome-board-disclaimer";
  return (
    <section className={`frame ${styles.hero}`} aria-labelledby="welcome-title" data-w="hero">
      <div className={styles.heroPanel} data-w="spotlight">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroAurora} aria-hidden="true" data-w="aurora"><span /><span /></div>
        <div className={styles.heroGlow} aria-hidden="true" data-w="glow" />
        <div className={styles.heroCopy}>
          <h1 id="welcome-title" className={styles.heroTitle}>{t.title}</h1>
          <p className={styles.heroLede}>{t.lede}</p>
          <div className={styles.heroActions}>
            <SignedInSwap
              signedOut={<AuthDialogLink locale={locale} next={`/${locale}`} className={`button cta ${styles.ctaBig}`}><span data-w="magnetic-inner">{t.primary}</span><IconArrowRight /></AuthDialogLink>}
              signedIn={<Link className={`button cta ${styles.ctaBig}`} href={`/${locale}/dashboard`}>{t.signedIn}<IconArrowRight /></Link>}
            />
            <Link className={styles.ghostLink} href={`/${locale}/methodology`}>{t.secondary}</Link>
          </div>
          <ul className={styles.heroNotes}>
            {t.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <div className={styles.boardWrap} data-w="tilt">
          <div className={styles.board} role="group" aria-labelledby="board-title" data-w="board">
            <header className={styles.boardHead}>
              <h2 id="board-title" className={styles.boardTitle}>{t.boardTitle}</h2>
              <SampleStamp text={t.boardStamp} />
            </header>
            <ol className={styles.boardList}>
              {rows.map((row, i) => {
                const state = kitState(row.state);
                return (
                  <li key={row.company.ticker} className={styles.boardRow}>
                    <span className={`${styles.rank} num`}>{i + 1}</span>
                    <span className={styles.boardName}>
                      <span className={styles.boardTicker}>{row.company.ticker}<span className={styles.rowSample}>{t.rowSample}</span></span>
                      <span className={styles.boardCompany}>{row.company.name}</span>
                    </span>
                    <span className={styles.boardBar}><ScoreBar percent={row.percent} state={state} stateLabel={label(locale, row.state)} locale={locale} label={t.colScore} describedBy={dis} size="sm" motion="load" /></span>
                    <span className={styles.boardChip}><StateChip state={state} label={label(locale, row.state)} size="sm" describedBy={dis} /></span>
                  </li>
                );
              })}
            </ol>
            <footer className={styles.boardFoot}>
              <p className={styles.boardNote}>{t.boardNote}</p>
              <Disclaimer id={dis} text={m.common.disclaimer} compact />
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 2. Rule band ---------- */

export function RuleBand({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeMessages(locale).band;
  const rules = ruleGroups.flatMap((g) => g.rules.map((r) => ({ ...r, group: g.group })));
  const items = rules.map((rule) => (
    <li key={rule.id} data-group={rule.group}>
      <span className={styles.bandName}>{m.rules[rule.id]}</span>
      <span className={`${styles.bandPts} num`}>{fill(t.points, { points: rule.points })}</span>
    </li>
  ));
  return (
    <section className={styles.band} aria-label={t.label} data-w="band">
      {/* One list in the HTML. The motion layer clones it once for a seamless loop; without it the list simply wraps. */}
      <div className={styles.bandTrack} data-w="band-track" tabIndex={0}>
        <ul className={styles.bandList}>{items}</ul>
      </div>
    </section>
  );
}

/* ---------- 3. Score story ---------- */

interface Step { id: RuleId; result: "pass" | "fail" | "none"; bonus: boolean; earned: number; percent: number; band: StateKey }

const bandFor = (percent: number): StateKey => (percent >= RELATIVE_RULES.setupPercent ? "setup" : percent >= RELATIVE_RULES.watchPercent ? "watch" : percent >= RELATIVE_RULES.waitPercent ? "wait" : "ignore");

/** The running score after each rule, in published order. The last step equals the engine's own display score. */
export function storySteps(row: SampleRow): { steps: Step[]; coreMax: number } {
  const hits = new Map(row.result.ruleHits.map((hit) => [hit.id, hit]));
  const core = new Set<string>(CORE_RULES.map((rule) => rule.id));
  const coreMax = CORE_RULES.filter((rule) => { const h = hits.get(rule.id); return h && !h.unknown; }).reduce((sum, rule) => sum + rule.points, 0);
  let earned = 0;
  const steps = ruleGroups.flatMap((g) => g.rules).map((rule) => {
    const hit = hits.get(rule.id);
    const result: Step["result"] = !hit || hit.unknown ? "none" : hit.matched ? "pass" : "fail";
    const bonus = !core.has(rule.id);
    if (!bonus && result === "pass") earned += rule.points;
    const percent = coreMax ? Math.round((earned / coreMax) * 1000) / 10 : 0;
    return { id: rule.id, result, bonus, earned, percent, band: bandFor(percent) };
  });
  return { steps, coreMax };
}

export function ScoreStory({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeMessages(locale).build;
  const row = specimenRow();
  const { steps, coreMax } = storySteps(row);
  const last = steps[steps.length - 1]!;
  const finalState = kitState(row.state);
  const met = steps.filter((s) => !s.bonus && s.result === "pass").length;
  const coreTotal = steps.filter((s) => !s.bonus).length;
  const bands: StateKey[] = ["ignore", "wait", "watch", "setup"];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const groupMax = (group: (typeof ruleGroups)[number]) => group.rules.filter((r) => !byId.get(r.id)?.bonus).reduce((sum, r) => sum + r.points, 0);
  const groupEarned = (group: (typeof ruleGroups)[number]) => group.rules.filter((r) => { const s = byId.get(r.id); return s && !s.bonus && s.result === "pass"; }).reduce((sum, r) => sum + r.points, 0);
  return (
    <section className={`frame ${styles.section}`} aria-labelledby="story-title" data-w="story" data-steps={JSON.stringify(steps.map((s) => ({ e: s.earned, p: s.percent, b: bands.indexOf(s.band) })))} data-locale={locale}>
      <SectionHead id="story-title" title={t.title} lede={t.lede} link={arrow(`/${locale}/methodology`, t.method)} />
      <div className={styles.story}>
        <div className={styles.stage}>
          <div className={`kit-card ${styles.meter}`} data-tone="navy">
            <p className={styles.meterHead}>
              <span className={styles.meterName}>{fill(t.specimen, { name: row.company.name, ticker: row.company.ticker })}</span>
              <SampleStamp text={m.common.sample} />
            </p>
            <div className={styles.meterFigures}>
              <p className={styles.figure}>
                <span className={styles.figureLabel}>{t.percent}</span>
                <span className={`${styles.figureValue} num`} data-w="percent">{pct(locale, last.percent)}</span>
              </p>
              <p className={styles.figure}>
                <span className={styles.figureLabel}>{t.earned}</span>
                <span className={`${styles.figureSmall} num`}><span data-w="earned">{last.earned}</span> / {coreMax}</span>
              </p>
            </div>
            <div className={styles.meterBar} aria-hidden="true">
              <span className={styles.meterFill} data-w="fill" style={{ "--v": last.percent / 100 } as CSSProperties} data-band={row.state} />
              {[RELATIVE_RULES.waitPercent, RELATIVE_RULES.watchPercent, RELATIVE_RULES.setupPercent].map((at) => <span key={at} className={styles.meterTick} style={{ insetInlineStart: `${at}%` }} />)}
            </div>
            <p className={styles.meterBands}>{fill(t.bands, { wait: pct(locale, RELATIVE_RULES.waitPercent), watch: pct(locale, RELATIVE_RULES.watchPercent), setup: pct(locale, RELATIVE_RULES.setupPercent) })}</p>
            <div className={styles.chipStack} data-w="chip" data-bands={JSON.stringify(bands)} data-labels={JSON.stringify(bands.map((band) => label(locale, band)))}>
              <StateChip state={finalState} label={label(locale, row.state)} size="md" />
            </div>
            <ul className={styles.groups} aria-hidden="true">
              {ruleGroups.map((group) => (
                <li key={group.group}>
                  <span className={styles.groupName}>{m.groups[group.group]}</span>
                  <span className={styles.groupTrack}><span data-w="group" data-group={group.group} style={{ "--v": groupMax(group) ? groupEarned(group) / groupMax(group) : 0 } as CSSProperties} /></span>
                  <span className={`${styles.groupPts} num`}>{groupEarned(group)}/{groupMax(group)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.result}>{fill(t.result, { ticker: row.company.ticker, met, total: coreTotal, state: label(locale, row.state) })}</p>
            <Disclaimer text={m.common.disclaimer} compact />
          </div>
        </div>
        <ol className={styles.rules} data-w="rules" aria-label={fill(t.specimen, { name: row.company.name, ticker: row.company.ticker })}>
          {ruleGroups.map((group) => (
            <li key={group.group} className={styles.ruleGroup} data-group-id={group.group}>
              <h3 className={styles.ruleGroupName}>{m.groups[group.group]}</h3>
              <ol className={styles.ruleList}>
                {group.rules.map((rule) => {
                  const s = byId.get(rule.id)!;
                  return (
                    <li key={rule.id} className={styles.rule} data-w="rule" data-result={s.result} data-bonus={s.bonus ? "" : undefined}>
                      <span className="kit-mark" data-result={s.result}><ResultMark result={s.result} /></span>
                      <span className={styles.ruleText}>
                        <span className={styles.ruleName}>{m.rules[rule.id]}</span>
                        {s.bonus ? <span className={styles.ruleBonus}>{t.bonus}</span> : null}
                      </span>
                      <span className={styles.ruleOutcome} data-w="outcome">
                        <span className={styles.ruleWord}>{s.result === "pass" ? t.pass : s.result === "fail" ? t.fail : t.none}</span>
                        <span className={`${styles.rulePts} num`}>{fill(t.points, { points: rule.points })}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- 4. Areas ---------- */

type AreaKey = "stocks" | "etfs" | "markets" | "record" | "method";
const AREAS: { key: AreaKey; pill: "open" | "account" | "plus" | "prep"; href?: string }[] = [
  { key: "stocks", pill: "account" },
  { key: "etfs", pill: "prep" },
  { key: "markets", pill: "prep" },
  { key: "record", pill: "account" },
  { key: "method", pill: "open", href: "/methodology" },
];

function AreaPreview({ area, locale }: { area: AreaKey; locale: Locale }) {
  const t = getWelcomeMessages(locale).areas;
  const rows = sampleRows();
  if (area === "stocks") {
    return (
      <ul className={styles.miniTable}>
        {rows.slice(0, 3).map((row) => (
          <li key={row.company.ticker} data-state={row.state}>
            <span className={styles.miniTicker}>{row.company.ticker}</span>
            <span className={styles.miniState}>{label(locale, row.state)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (area === "method") {
    return (
      <p className={styles.miniRule}>
        <span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span>
        <span>{t.previewRule}</span>
        <span className="num">4</span>
      </p>
    );
  }
  if (area === "record") {
    const states: StateKey[] = ["watch", "setup", "broken"];
    return (
      <ol className={styles.miniTimeline}>
        {states.map((s) => <li key={s} data-state={s}>{label(locale, s)}</li>)}
      </ol>
    );
  }
  // ETFs and markets: a quiet chart sketch, clearly a placeholder shape, no figures.
  return (
    <svg className={styles.miniChart} viewBox="0 0 120 40" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path d={area === "etfs" ? "M0 30 L15 27 L30 29 L45 22 L60 24 L75 16 L90 18 L105 11 L120 13" : "M0 22 L15 25 L30 18 L45 21 L60 14 L75 19 L90 12 L105 15 L120 8"} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AreaGrid({ locale }: { locale: Locale }) {
  const t = getWelcomeMessages(locale).areas;
  return (
    <section className={`frame ${styles.section}`} aria-labelledby="areas-title">
      <SectionHead id="areas-title" title={t.title} lede={t.lede} />
      <ul className={styles.areas} data-w-group="">
        {AREAS.map((area) => {
          const item = t.items[area.key];
          const body = (
            <>
              <div className={styles.areaTop}>
                <h3 className={styles.areaTitle}>{item.title}</h3>
                <span className={styles.pill} data-pill={area.pill}>{t.pills[area.pill]}</span>
              </div>
              <p className={styles.areaBody}>{item.body}</p>
              <figure className={styles.areaPreview}>
                <AreaPreview area={area.key} locale={locale} />
                <figcaption><span className="stamp">{t.preview}</span></figcaption>
              </figure>
            </>
          );
          return (
            <li key={area.key} className={`kit-card ${styles.area}`} data-area={area.key} data-w="tilt">
              {area.href ? <Link className={styles.areaLink} href={`/${locale}${area.href}`}>{body}</Link> : body}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- 5. Tiers ---------- */

/** "Showing 90 days of 400 days" for the sample score history: the free window from TIER_LIMITS, the total is a SAMPLE figure. */
export function historyDepth(locale: Locale): string {
  const pm = getPricingMessages(locale);
  const shown = TIER_LIMITS.free.scoreHistoryDays ?? SAMPLE_HISTORY_DAYS;
  return fill(pm.locks.depth, { shown: plural(locale, pm.days, shown), total: plural(locale, pm.days, SAMPLE_HISTORY_DAYS), older: plural(locale, pm.days, SAMPLE_HISTORY_DAYS - shown) });
}

export function Tiers({ locale, pricingOpen }: { locale: Locale; pricingOpen: boolean }) {
  const t = getWelcomeMessages(locale).tiers;
  const pm = getPricingMessages(locale);
  return (
    <section className={`frame ${styles.section}`} aria-labelledby="tiers-title">
      <SectionHead id="tiers-title" title={t.title} lede={t.lede} link={pricingOpen ? arrow(`/${locale}/pricing`, t.compare) : undefined} />
      <div className={styles.tiers} data-w-group="">
        <article className={`kit-card ${styles.tier}`} aria-labelledby="tier-free" data-w="tilt">
          <header className={styles.tierHead}>
            <h3 id="tier-free" className={styles.tierName}>{t.freeTitle}</h3>
            <p className={`${styles.tierPrice} num`}>{formatEur(locale, 0)}</p>
            <p className={styles.tierSub}>{t.freePrice}</p>
          </header>
          <ul className={styles.tierList}>
            {t.free.map((item) => <li key={item} data-tick="">{item}</li>)}
          </ul>
          <AuthDialogLink locale={locale} next={`/${locale}`} className="button secondary">{getWelcomeMessages(locale).hero.primary}</AuthDialogLink>
        </article>
        <article className={`kit-card ${styles.tier} ${styles.tierPlus}`} aria-labelledby="tier-plus" data-w="tilt">
          <header className={styles.tierHead}>
            <h3 id="tier-plus" className={styles.tierName}>{t.plusTitle}<span className={styles.plannedTag}>{t.plusPlanned}</span></h3>
            <p className={styles.tierPrice}><span className="num">{fill(pm.plans.monthly, { price: formatEur(locale, PLUS_PRICE.monthlyEur) })}</span></p>
            <p className={styles.tierSub}><span className="num">{fill(pm.plans.yearly, { price: formatEur(locale, PLUS_PRICE.yearlyEur) })}</span><br />{fill(pm.plans.yearlyNote, { price: formatEur(locale, yearlyPerMonth()) })}</p>
          </header>
          <ul className={styles.tierList}>
            {t.plus.map((item) => <li key={item}><span className={styles.lockDot} aria-hidden="true" />{item}</li>)}
          </ul>
          <p className={styles.tierStatus}>{t.plusStatus}</p>
          <p className={styles.tierVat}>{pm.plans.vat}</p>
        </article>
        <div className={styles.tierLock}>
          <PlusLock
            form="depth"
            badge={pm.locks.badge}
            title={pm.locks.historyTitle}
            note={pm.locks.historyNote}
            summary={historyDepth(locale)}
            action={{ href: pricingOpen ? `/${locale}/pricing#plus` : `/${locale}/methodology`, label: pricingOpen ? pm.locks.see : getWelcomeMessages(locale).hero.secondary }}
          >
            <p className={styles.lockHead}><span className={styles.lockTitle}>{pm.locks.historyTitle}</span><span className="stamp">{pm.locks.sample}</span></p>
            <svg className={styles.lockSpark} viewBox="0 0 200 48" aria-hidden="true" focusable="false" preserveAspectRatio="none">
              <path d="M0 34 L20 30 L40 32 L60 24 L80 26 L100 18 L120 22 L140 14 L160 16 L180 10 L200 12" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          </PlusLock>
        </div>
      </div>
    </section>
  );
}

/* ---------- 6. Trust ---------- */

export function Trust({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeMessages(locale).trust;
  // Only sources whose terms allow display, by name and licence class in plain words. No vendor appears here.
  const shown = DATA_SOURCES.filter((s) => s.displayAllowed && (s.licenceClass === "public_gov" || s.licenceClass === "public_attrib"));
  return (
    <section className={`frame ${styles.section}`} aria-labelledby="trust-title">
      <SectionHead id="trust-title" title={t.title} />
      <div className={styles.trust}>
        <div className={styles.trustMain}>
          <p className={styles.trustLead}>{t.operator}</p>
          <Disclaimer text={m.common.disclaimer} />
          {m.common.operatorDisclosure ? <p className={styles.trustSmall}>{m.common.operatorDisclosure}</p> : null}
        </div>
        <div>
          <h3 className={styles.h3}>{t.sourcesTitle}</h3>
          <dl className={styles.sources}>
            {(["public_gov", "public_attrib"] as const).map((cls) => {
              const names = shown.filter((s) => s.licenceClass === cls).map((s) => s.name);
              return names.length ? (
                <div key={cls}>
                  <dt className={styles.sourceClass}>{t.classes[cls]}</dt>
                  <dd className={styles.sourceName}>{names.join(", ")}</dd>
                </div>
              ) : null;
            })}
          </dl>
        </div>
        <div>
          <h3 className={styles.h3}>{t.legalTitle}</h3>
          <ul className={styles.legal}>
            {(["terms", "privacy", "disclaimer"] as const).map((key) => <li key={key}>{arrow(`/${locale}/legal/${key}`, t.legal[key])}</li>)}
          </ul>
          <p className={styles.trustSmall}>{t.pending}</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- 7. FAQ ---------- */

export function Faq({ locale }: { locale: Locale }) {
  const t = getWelcomeMessages(locale).faq;
  return (
    <section className={`frame ${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
      <SectionHead id="faq-title" title={t.title} />
      <div className={styles.faq}>
        {t.items.map((item) => (
          <details key={item.q} className={styles.faqItem}>
            <summary><span>{item.q}</span><span className={styles.faqIcon} aria-hidden="true" /></summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- 8. Close ---------- */

export function CloseBlock({ locale }: { locale: Locale }) {
  const t = getWelcomeMessages(locale).close;
  return (
    <section className={`frame ${styles.close}`} aria-labelledby="join-title" id="join">
      <div className={styles.closePanel}>
        <div className={styles.closeCopy}>
          <h2 id="join-title" className={styles.closeTitle} data-w="reveal">{t.title}</h2>
          <p className={styles.closeLede}>{t.body}</p>
        </div>
        <div className={`kit-card ${styles.closeForm}`}>
          <AuthForm locale={locale} next={`/${locale}`} headingLevel={2} hideHeading />
        </div>
      </div>
    </section>
  );
}

