import type { ReactNode } from "react";
import { fill, formatScorePercent, type Locale, type Messages } from "@/i18n";
import { type StateKey } from "@/i18n/rules";
import type { StatusView } from "@/engine/status";
import { CORE_RULES, type DisplayHit } from "@/engine/display-score";
import { getKitMessages } from "@/i18n/kit-messages";
import { IconBandBroken, IconBandIgnore, IconBandSetup, IconBandWait, IconBandWatch, IconCheck, IconCross, IconNoData } from "./icons";
import { AdrLine } from "./disclaimer";
import { CountUp, ScoreDial, kitState } from "./kit";
import styles from "./status-slider.module.css";

/** Slider order, left to right: step 1 to 5. "insufficient" is not a step. */
export const steps: StateKey[] = ["broken", "ignore", "wait", "watch", "setup"];

const bandIcons: Record<StateKey, () => ReactNode> = {
  broken: () => <IconBandBroken />,
  ignore: () => <IconBandIgnore />,
  wait: () => <IconBandWait />,
  watch: () => <IconBandWatch />,
  setup: () => <IconBandSetup />,
  insufficient: () => <IconNoData />,
};

/** Label for a state. Only the green label changes with ADVICE_OUTPUT. */
export function statusLabel(m: Messages, state: StateKey, adviceOutput: boolean): string {
  void adviceOutput;
  return m.status.labels[state];
}

export function StatusIcon({ state }: { state: StateKey }) {
  return <span className={styles.icon} data-state={state} aria-hidden="true">{bandIcons[state]()}</span>;
}

/** Five small steps for rows and the legend. The active step is filled and taller. Position null draws the empty gray track. */
export function MiniTrack({ position, ariaLabel }: { position: number | null; ariaLabel?: string }) {
  return (
    <span className={styles.mini} data-none={position === null ? "" : undefined} {...(ariaLabel ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true })}>
      {steps.map((state, index) => <span key={state} className={styles.miniStep} data-state={state} data-active={position === index ? "" : undefined} />)}
    </span>
  );
}

/** Band icon and label in the band color. Used for group headings and the legend. */
export function StatusBadge({ state, label }: { state: StateKey; label: string }) {
  return <span className={styles.badge} data-state={state}><StatusIcon state={state} /><span>{label}</span></span>;
}

/** Status cell for table rows: mini track, icon and label. The track's aria-label is the full reading, so the visible label is hidden from screen readers. */
export function StatusCell({ state, position, label, ariaLabel, pullbackLabel, describedBy }: { state: StateKey; position: number | null; label: string; ariaLabel: string; pullbackLabel?: string | null; describedBy?: string }) {
  return (
    <span className={styles.cell} data-state={state} aria-describedby={describedBy}>
      <MiniTrack position={position} ariaLabel={ariaLabel} />
      <StatusIcon state={state} />
      <span className={styles.cellLabel} aria-hidden="true">{label}</span>
      {pullbackLabel ? <span className={styles.qualifier}>{pullbackLabel}</span> : null}
    </span>
  );
}

/** Plain-language completeness in compact rows. */
export function DataCell({ known, total, scored, label }: { known: number; total: number; scored: boolean; label: string }) {
  return scored ? <span className={styles.data}>{fill(label, { known, total })}</span> : null;
}

/** The five-step track with a marker over the active step. Read-only, so no slider role and no focus. */
export function StatusTrack({ view, m, adviceOutput }: { view: StatusView; m: Messages; adviceOutput: boolean }) {
  const active = view.display.state === "insufficient" ? null : steps.indexOf(view.display.state);
  const setup = statusLabel(m, "setup", adviceOutput);
  return (
    <ol className={styles.track} data-none={active === null ? "" : undefined} aria-label={fill(m.status.scaleAria, { setup })}>
      {steps.map((state, index) => {
        const isActive = active === index;
        const label = statusLabel(m, state, adviceOutput);
        return (
          <li key={state} className={styles.step} data-state={state} data-active={isActive ? "" : undefined} data-edge={index === 0 ? "start" : index === 4 ? "end" : undefined} aria-current={isActive ? "step" : undefined}>
            <span className={styles.block}>{isActive ? <span className={styles.marker} aria-hidden="true" /> : null}{isActive ? <StatusIcon state={state} /> : null}</span>
            <span className={styles.caption}>
              <span className={styles.stepLabel}>{label}</span>
              <span className={styles.range}>{m.status.ranges[state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function summarySentence(view: StatusView, m: Messages, adviceOutput: boolean, locale: Locale): string {
  const label = statusLabel(m, view.display.state, adviceOutput);
  if (view.display.state === "insufficient") return fill(m.status.summaryAriaNone, { label });
  if (view.display.state === "broken") return fill(m.status.summaryAriaBroken, { label });
  return fill(m.status.summaryAria, { label, step: (activeStep(view.display.state) ?? 0) + 1, percent: formatScorePercent(locale, view.display.percent ?? 0), known: view.display.coreKnown, total: view.display.coreTotal });
}

const activeStep = (state: StateKey) => state === "insufficient" ? null : steps.indexOf(state);

/** Completeness counts core rules; bonus findings have their own line. */
export function StatusCoverage({ view, m }: { view: StatusView; m: Messages; adviceOutput?: boolean }) {
  if (view.display.state === "insufficient") return null;
  const d = view.display;
  return <div className={styles.coverage}>
    <p className={styles.coverageLine}><IconNoData /><span>{fill(m.status.coreData, { known: d.coreKnown, total: d.coreTotal })}</span></p>
    {d.unknownCore.length ? <p className={styles.coverageRules}>{m.status.dataMissing.split("{rules}")[0]}{d.unknownCore.map((id, index) => <span key={id}>{index ? ", " : ""}<a className={styles.ruleLink} href={`#rule-${id}`}>{m.status.ruleShort[id]}</a></span>)}</p> : null}
    {d.incomplete && d.state !== "broken" ? <p className={styles.cap}>{m.status.coverageCapPlain}</p> : null}
  </div>;
}

/** Number of core rules (bonus excluded) that matched. A rule with no data is not met. */
export function coreRulesMet(hits: readonly { id: string; matched?: boolean }[]): number {
  const core = new Set<string>(CORE_RULES.map((rule) => rule.id));
  return hits.filter((hit) => hit.matched === true && core.has(hit.id)).length;
}

/** "Meets 6 of 9 rules" and, unless criteria broke, the band cutoffs. Bonus findings are not in the count. */
export function RulesMet({ view, m, coreMet, cutoffs = true }: { view: StatusView; m: Messages; coreMet: number; cutoffs?: boolean }) {
  if (view.display.state === "insufficient") return null;
  return <>
    <p className={styles.pointsLine} data-rules-met="">{fill(m.status.rulesMet, { met: coreMet, total: view.display.coreTotal })}</p>
    {cutoffs && view.display.state !== "broken" ? <p className={styles.pointsLine} data-cutoffs="">{m.status.cutoffs}</p> : null}
  </>;
}

export function BonusBlock({ view, m, tiles = false }: { view: StatusView; m: Messages; tiles?: boolean }) {
  if (view.display.state === "insufficient") return null;
  return <div className={styles.coverage} data-bonus=""><strong>{m.status.bonusTitle}</strong><span> {m.status.bonusNote}</span>
    <ul>{view.display.bonus.map(({ id, hit }) => {
      const result = !hit || hit.unknown ? "none" : hit.matched ? "pass" : "fail";
      return <li key={id} data-result={result}>{tiles ? <span className={styles.bonusIcon} aria-hidden="true">{result === "pass" ? <IconCheck /> : result === "fail" ? <IconCross /> : <IconNoData />}</span> : null}<a href={`#rule-${id}`}>{m.status.ruleShort[id]}</a>: {result === "pass" ? m.common.met : result === "fail" ? m.common.notMet : m.status.noData}</li>;
    })}</ul>
  </div>;
}

/** Five fixed chips. They explain the score and never change the band. */
export function ConfirmationChips({ view, m }: { view: StatusView; m: Messages }) {
  return (
    <div className={styles.confirm}>
      <p className={styles.confirmHead}>
        <span id="confirm-title" className={styles.confirmTitle}>{m.status.confirmTitle}</span>
        <span className={styles.confirmNote}>{m.status.confirmNote}</span>
      </p>
      <ul className={styles.chips} aria-labelledby="confirm-title">
        {view.confirmations.map((chip) => {
          const name = m.status.confirmations[chip.id];
          const word = chip.state === "met" ? m.status.confirmationState.met : chip.state === "not-met" ? m.status.confirmationState.notMet : m.status.confirmationState.noData;
          return (
            <li key={chip.id} className={styles.chip} data-confirm={chip.state} data-id={chip.id}>
              {chip.state === "met" ? <IconCheck /> : chip.state === "not-met" ? <IconCross /> : <IconNoData />}
              <span>{name}</span>
              <span className="visually-hidden">: {word}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface StatusPanelProps {
  view: StatusView;
  m: Messages;
  locale: Locale;
  adviceOutput: boolean;
  /** Formatted session date, or null when there is none. */
  asOf: string | null;
  methodHref: string;
  /** Rejection reasons (broken) or invalid-data reasons (insufficient), already localized. */
  reasons: string[];
  groups?: { short: string; name: string; score: number; max: number; noData: number }[];
  pullbackLabel?: string | null;
  disclaimer?: ReactNode;
  describedBy?: string;
  /** Core rules met, for the "Meets n of m rules" line. Omitted: no line. */
  coreMet?: number;
  ruleHits?: readonly DisplayHit[];
  /** "rail" uses four reading tiles beside the company page's radar. */
  variant?: "panel" | "rail";
  /** Extra global classes for the section, for example the page's card class. */
  className?: string;
}

/**
 * A full panel or a four-tile company rail. Both keep the state, rule coverage, cutoffs and disclaimer together.
 */
export function StatusPanel({ view, m, locale, adviceOutput, asOf, methodHref, reasons, pullbackLabel, disclaimer, describedBy, coreMet, ruleHits, variant = "panel", className }: StatusPanelProps) {
  const label = statusLabel(m, view.display.state, adviceOutput);
  const scored = view.display.state !== "insufficient";
  const broken = view.display.state === "broken";
  const dialState = kitState(view.display.state, Boolean(pullbackLabel));
  const rail = variant === "rail";
  if (rail) {
    const byId = new Map(ruleHits?.map((hit) => [hit.id, hit]) ?? []);
    return <section className={[styles.panel, styles.rail, className ?? ""].filter(Boolean).join(" ")} data-state={view.display.state} aria-labelledby="status-title">
      <div className={`${styles.tile} ${styles.stateTile}`}>
        <div className={styles.railLead}>
          <h2 id="status-title" className={styles.label} aria-describedby={describedBy}><StatusIcon state={view.display.state} /><span className={styles.labelText}>{label}</span>{pullbackLabel ? <span className={styles.qualifier}>{pullbackLabel}</span> : null}</h2>
          {asOf ? <p className={styles.sub}>{fill(m.status.asOf, { date: asOf })}</p> : null}
        </div>
        <p className="visually-hidden" id="status-summary">{summarySentence(view, m, adviceOutput, locale)}</p>
        <StatusTrack view={view} m={m} adviceOutput={adviceOutput} />
        {scored && !broken && coreMet !== undefined ? <p className={styles.cutoffs} data-cutoffs="">{m.status.cutoffs}</p> : null}
        {reasons.length > 0 && (broken || !scored) ? <p className={styles.because}>{fill(broken ? m.status.brokenBecause : m.status.insufficientBecause, { reasons: reasons.join("; ") })}</p> : null}
      </div>
      <div className={`${styles.tile} ${styles.rulesTile}`}>
        {coreMet !== undefined && scored ? <>
          <div className={styles.ruleFigure}><CountUp value={coreMet} locale={locale} motion="load" /><span>{getKitMessages(locale).score.ruleCountJoin} {view.display.coreTotal}</span></div>
          <RulesMet view={view} m={m} coreMet={coreMet} cutoffs={false} />
        </> : <p className={styles.pointsLine}>{broken ? m.status.pointsNotCountedPlain : m.status.headline.insufficient}</p>}
        <ol className={styles.ruleSegments} aria-label={coreMet === undefined ? m.status.noData : m.status.rulesMet.replace("{met}", String(coreMet)).replace("{total}", String(view.display.coreTotal))}>
          {CORE_RULES.map((rule) => {
            const hit = byId.get(rule.id);
            const result = !hit || hit.unknown ? "none" : hit.matched ? "pass" : "fail";
            const word = result === "pass" ? m.common.met : result === "fail" ? m.common.notMet : m.status.noData;
            return <li key={rule.id} data-result={result}><a href={`#rule-${rule.id}`} aria-label={`${m.status.ruleShort[rule.id]}: ${word}`} title={`${m.status.ruleShort[rule.id]}: ${word}`}><span aria-hidden="true">{result === "pass" ? "✓" : result === "fail" ? "×" : "–"}</span></a></li>;
          })}
        </ol>
        <StatusCoverage view={view} m={m} />
      </div>
      <div className={`${styles.tile} ${styles.bonusTile}`}>
        {scored ? <BonusBlock view={view} m={m} tiles /> : null}
        <ConfirmationChips view={view} m={m} />
      </div>
      <div className={`${styles.tile} ${styles.noteTile}`}>
        <a className={styles.methodLink} href={methodHref}>{m.status.methodLink}</a>
        <AdrLine text={m.common.disclaimer} id="score-disclaimer" />
        {disclaimer}
      </div>
    </section>;
  }
  return (
    <section className={[styles.panel, className ?? ""].filter(Boolean).join(" ")} data-state={view.display.state} aria-labelledby="status-title">
      <div className={styles.dialCol}>
        <ScoreDial
          percent={broken || !scored ? null : view.display.percent ?? null}
          state={dialState}
          stateLabel={pullbackLabel ? `${label}, ${pullbackLabel}` : label}
          locale={locale}
          size="lg"
          motion="load"
          describedBy={describedBy}
          caption={broken ? m.status.pointsNotCountedPlain : undefined}
        />
      </div>
      <div className={styles.main}>
        <div className={styles.lead}>
          <h2 id="status-title" className={styles.label} aria-describedby={describedBy}>
            <StatusIcon state={view.display.state} />
            <span className={styles.labelText}>{label}</span>
            {pullbackLabel ? <span className={styles.qualifier}>{pullbackLabel}</span> : null}
          </h2>
          <p className={styles.sub}>
            {asOf ? <span>{fill(m.status.asOf, { date: asOf })}</span> : null}
            <a className={styles.methodLink} href={methodHref}>{m.status.methodLink}</a>
          </p>
        </div>
        {scored ? (
          <div className={styles.facts}>
            {coreMet === undefined ? null : <RulesMet view={view} m={m} coreMet={coreMet} cutoffs={false} />}
            <StatusCoverage view={view} m={m} adviceOutput={adviceOutput} />
          </div>
        ) : null}
        <p className="visually-hidden" id="status-summary">{summarySentence(view, m, adviceOutput, locale)}</p>
        <StatusTrack view={view} m={m} adviceOutput={adviceOutput} />
        {coreMet !== undefined && scored && !broken ? <p className={styles.cutoffs} data-cutoffs="">{m.status.cutoffs}</p> : null}
        <AdrLine text={m.common.disclaimer} id="score-disclaimer" />
        {reasons.length > 0 && (broken || !scored) ? <p className={styles.because}>{fill(broken ? m.status.brokenBecause : m.status.insufficientBecause, { reasons: reasons.join("; ") })}</p> : null}
      </div>
      <div className={styles.foot}>
        {scored ? <BonusBlock view={view} m={m} /> : null}
        <ConfirmationChips view={view} m={m} />
        {disclaimer}
      </div>
    </section>
  );
}
