import Link from "next/link";
import type { ScoreResult } from "@/engine";
import type { Instrument } from "@/data/providers";
import { fill, formatDate, formatScorePercent, getMessages, type Locale } from "@/i18n";
import { ruleGroups } from "@/i18n/rules";
import { displayScore, BONUS_RULE_IDS } from "@/engine/display-score";
import { sectorLabel, stateKey } from "@/i18n/score-text";
import { Disclaimer } from "./disclaimer";
import { IconArrowRight, IconCheck, IconCross } from "./icons";
import { OperatorDisclosure, SampleStamp } from "./operator-disclosure";
import { StateChip } from "./score-badge";

/** Title block: the field grid at the head of every datasheet. */
export function TitleBlock({ fields, stamp }: { fields: { label: string; value: React.ReactNode; wide?: boolean }[]; stamp?: string }) {
  return (
    <dl className="title-block">
      {fields.map((field) => (
        <div key={field.label} className={field.wide ? "tb-field is-wide" : "tb-field"}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
      {stamp && <div className="tb-field tb-stamp"><SampleStamp text={stamp} /></div>}
    </dl>
  );
}

export function groupLabels(locale: Locale, result: Pick<ScoreResult, "fundamentals" | "technical" | "macro">) {
  const g = getMessages(locale).groups;
  return [
    { short: g.fundamentalsShort, name: g.fundamentals, score: result.fundamentals },
    { short: g.technicalShort, name: g.technical, score: result.technical },
    { short: g.macroShort, name: g.macro, score: result.macro },
  ];
}

/** Compact datasheet used as the landing specimen. */
export function Datasheet({ locale, instrument, result, sample = true }: { locale: Locale; instrument: Instrument; result: ScoreResult; sample?: boolean }) {
  const m = getMessages(locale);
  const state = stateKey(result.state);
  const met = new Set(result.ruleHits.filter((hit) => hit.matched).map((hit) => hit.id));
  const date = formatDate(locale, result.asOf);
  const display = displayScore(state, result.ruleHits);
  return (
    <figure className="sheet specimen">
      <TitleBlock
        stamp={sample ? m.common.sample : undefined}
        fields={[
          { label: m.table.ticker, value: <span className="tb-ticker">{instrument.ticker}</span> },
          { label: m.table.company, value: instrument.name, wide: true },
          { label: m.company.sector, value: sectorLabel(locale, instrument.sector) },
          { label: m.company.session, value: <span className="num">{date}</span> },
        ]}
      />
      <div className="specimen-score">
        <p className="score-total num">
          {display.percent === null ? m.common.noScore : formatScorePercent(locale, display.percent)}
        </p>
        <div className="specimen-state">
          <StateChip state={display.state} label={m.states[display.state]} pullbackLabel={display.state === "watch" && result.pullbackInUptrend ? m.states.pullback : null} />
          <Disclaimer text={m.common.disclaimer} compact />
        </div>
      </div>
      <p className="small">{fill(m.status.coreData, { known: display.coreKnown, total: display.coreTotal })}</p>
      <p className="small">{m.status.bonusTitle}: {display.bonus.map(({ id, hit }) => `${m.status.ruleShort[id]} ${hit?.matched ? m.common.met : !hit || hit.unknown ? m.status.noData : m.common.notMet}`).join(", ")}</p>
      <ul className="hit-list">
        {ruleGroups.flatMap((group) =>
          group.rules.map((rule) => {
            const hit = met.has(rule.id);
            return (
              <li key={rule.id} className={hit ? "is-met" : undefined}>
                {hit ? <IconCheck title={m.common.met} /> : <IconCross title={m.common.notMet} />}
                <span>{m.rules[rule.id]} ({BONUS_RULE_IDS.includes(rule.id) ? m.status.bonusLabel : m.status.coreLabel})</span>
                <span className="num hit-points">{hit ? `+${rule.points}` : "0"}</span>
              </li>
            );
          }),
        )}
      </ul>
      <figcaption className="specimen-foot">
        <span>{fill(sample ? m.home.specimenCaption : m.home.datasheetCaption, { ticker: instrument.ticker, date })}</span>
        <Link className="arrow-link" href={`/${locale}/company/${instrument.ticker}`}>
          {fill(m.home.specimenLink, { ticker: instrument.ticker })}
          <IconArrowRight />
        </Link>
      </figcaption>
      <OperatorDisclosure text={m.common.operatorDisclosure} />
    </figure>
  );
}
