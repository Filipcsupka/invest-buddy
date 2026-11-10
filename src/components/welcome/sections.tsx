import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AuthDialogLink } from "@/components/auth/auth-dialog";
import { Disclaimer } from "@/components/disclaimer";
import { ScoreBar, StateChip, kitState } from "@/components/kit";
import { SampleStamp } from "@/components/operator-disclosure";
import { CORE_RULES } from "@/engine/display-score";
import { RELATIVE_RULES } from "@/engine/relative";
import { fill, formatScorePercent, getMessages, plural, type Locale } from "@/i18n";
import { TIER_LIMITS } from "@/config/tiers";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { ruleGroups, type RuleId, type StateKey } from "@/i18n/rules";
import { getWelcomeMessages } from "@/i18n/welcome-messages";
import { SAMPLE_HISTORY_DAYS, sampleRows, specimenRow, type SampleRow } from "./sample-data";
import { Chip, G, Mark } from "./glyphs";
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

const arrow = (href: string, text: string) => <Link className="arrow-link" href={href}>{text}<G g="arrow" /></Link>;

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
              signedOut={<AuthDialogLink locale={locale} next={`/${locale}`} className={`button cta ${styles.ctaBig}`}><span data-w="magnetic-inner">{t.primary}</span><G g="arrow" /></AuthDialogLink>}
              signedIn={<Link className={`button cta ${styles.ctaBig}`} href={`/${locale}/dashboard`}>{t.signedIn}<G g="arrow" /></Link>}
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
                    <span className={styles.boardChip}><Chip state={state} label={label(locale, row.state)} size="sm" describedBy={dis} /></span>
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
    <section className={`frame ${styles.section}`} aria-labelledby="story-title" data-w="story" data-steps={steps.map((s) => `${s.earned},${s.percent},${bands.indexOf(s.band)}`).join(" ")} data-locale={locale}>
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
                    <li key={rule.id} data-w="rule" data-result={s.result} data-bonus={s.bonus ? "" : undefined}>
                      <Mark result={s.result} />
                      <span>{m.rules[rule.id]}{s.bonus ? <small>{t.bonus}</small> : null}</span>
                      <span data-w="outcome"><b>{s.result === "pass" ? t.pass : s.result === "fail" ? t.fail : t.none}</b>{fill(t.points, { points: rule.points })}</span>
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

/* ---------- 5. Tiers ---------- */

/** "Showing 90 days of 400 days" for the sample score history: the free window from TIER_LIMITS, the total is a SAMPLE figure. */
export function historyDepth(locale: Locale): string {
  const pm = getPricingMessages(locale);
  const shown = TIER_LIMITS.free.scoreHistoryDays ?? SAMPLE_HISTORY_DAYS;
  return fill(pm.locks.depth, { shown: plural(locale, pm.days, shown), total: plural(locale, pm.days, SAMPLE_HISTORY_DAYS), older: plural(locale, pm.days, SAMPLE_HISTORY_DAYS - shown) });
}
