import Link from "next/link";
import { Disclaimer } from "@/components/disclaimer";
import { IconArrowRight } from "@/components/icons";
import { RuleRow, RuleTable, ScoreDial, StateChip, kitState } from "@/components/kit";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { coreRulesMet } from "@/components/status-slider";
import type { Instrument } from "@/data/providers";
import { BONUS_RULE_IDS, displayScore } from "@/engine/display-score";
import type { ScoreResult } from "@/engine";
import { fill, formatDate, formatPercent, formatNumber, getMessages, type Locale } from "@/i18n";
import { getLandingMessages } from "@/i18n/landing-messages";
import { ruleGroups } from "@/i18n/rules";
import { sectorLabel, stateKey } from "@/i18n/score-text";
import styles from "./landing.module.css";

/** The hero: one real datasheet, rule by rule. The dial settles and the rule rows check in once on first paint. */
export function Specimen({ locale, instrument, result, sample }: { locale: Locale; instrument: Instrument; result: ScoreResult; sample: boolean }) {
  const m = getMessages(locale);
  const t = getLandingMessages(locale).specimen;
  const state = stateKey(result.state);
  const display = displayScore(state, result.ruleHits);
  const chip = kitState(display.state, display.state === "watch" && result.pullbackInUptrend);
  const chipLabel = chip === "pullback" ? m.states.pullback : m.states[display.state];
  const hits = new Map(result.ruleHits.map((hit) => [hit.id, hit]));
  const thresholds = { ratio: formatNumber(locale, 1.2, 1), min: formatPercent(locale, 0.05, 0), max: formatPercent(locale, 0.1, 0) };
  const date = formatDate(locale, result.asOf);
  const dis = "specimen-disclaimer";
  let index = 0;
  return (
    <figure className={styles.specimen} aria-labelledby="specimen-title">
      <header className={styles.sheetHead}>
        <div className={styles.sheetId}>
          <p className={styles.ticker}>{instrument.ticker}</p>
          <p className={styles.company}>{instrument.name}</p>
          <p className={styles.meta}>
            {sectorLabel(locale, instrument.sector)}
            <span aria-hidden="true"> / </span>
            <span className="num">{date}</span>
          </p>
        </div>
        {sample ? <SampleStamp text={m.common.sample} /> : null}
      </header>
      <div className={styles.scoreRow}>
        <ScoreDial percent={display.percent} state={chip} stateLabel={chipLabel} locale={locale} motion="load" size="lg" describedBy={dis} />
        <div className={styles.scoreSide}>
          <StateChip state={chip} label={chipLabel} size="lg" describedBy={dis} />
          <p className={styles.small}>{fill(m.status.rulesMet, { met: coreRulesMet(result.ruleHits), total: display.coreTotal })}</p>
          <p className={styles.small}>{fill(t.scoreNote, { known: display.coreKnown, total: display.coreTotal })}</p>
          <Disclaimer id={dis} text={m.common.disclaimer} compact />
        </div>
      </div>
      <div className={styles.scan}>
        <h2 id="specimen-title" className="visually-hidden">{fill(t.title, { ticker: instrument.ticker })}</h2>
        <RuleTable locale={locale} label={fill(t.title, { ticker: instrument.ticker })} labelledBy="specimen-title" motion="load" describedBy={dis}>
          {ruleGroups.flatMap((group) => [
            <tr key={group.group} className="kit-rule-group"><th colSpan={5} scope="colgroup">{m.groups[group.group]}</th></tr>,
            ...group.rules.map((rule) => {
              const hit = hits.get(rule.id);
              const result = !hit || hit.unknown ? "none" : hit.matched ? "pass" : "fail";
              const bonus = BONUS_RULE_IDS.includes(rule.id);
              return (
                <RuleRow
                  key={rule.id}
                  index={index++}
                  id={rule.id}
                  locale={locale}
                  name={bonus ? `${m.rules[rule.id]} (${m.status.bonusLabel})` : m.rules[rule.id]}
                  needs={fill(m.ruleThresholds[rule.id], thresholds)}
                  value={result === "none" ? undefined : result === "pass" ? m.common.yes : m.common.no}
                  result={result}
                  max={rule.points}
                />
              );
            }),
          ])}
        </RuleTable>
      </div>
      <figcaption className={styles.sheetFoot}>
        <span>{sample ? t.sampleNote : t.liveNote}</span>
        <Link className="arrow-link" href={`/${locale}/company/${instrument.ticker}`}>
          {fill(m.home.specimenLink, { ticker: instrument.ticker })}
          <IconArrowRight />
        </Link>
      </figcaption>
      <OperatorDisclosure text={m.common.operatorDisclosure} />
    </figure>
  );
}
