import type { ReactNode } from "react";
import { fill, type Messages } from "@/i18n";
import { ruleGroups, type RuleId, type StateKey } from "@/i18n/rules";
import type { StatusView } from "@/engine/status";
import { IconBandBroken, IconBandIgnore, IconBandSetup, IconBandWait, IconBandWatch, IconCheck, IconCross, IconNoData } from "./icons";
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
  return state === "setup" && adviceOutput ? m.status.advice.setup : m.status.labels[state];
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

/** Data column: "23/25" and a no-data mark with the rule list in the title. Empty for an unscored ticker. */
export function DataCell({ known, noDataRules, scored }: { known: number; noDataRules: string; scored: boolean }) {
  if (!scored) return null;
  return (
    <span className={styles.data} title={noDataRules || undefined}>
      <span className="num">{known}/25</span>
      {known < 25 ? <IconNoData /> : null}
      {noDataRules ? <span className="visually-hidden">{noDataRules}</span> : null}
    </span>
  );
}

/** The five-step track with a marker over the active step. Read-only, so no slider role and no focus. */
export function StatusTrack({ view, m, adviceOutput }: { view: StatusView; m: Messages; adviceOutput: boolean }) {
  const active = view.position;
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

export function summarySentence(view: StatusView, m: Messages, adviceOutput: boolean): string {
  const label = statusLabel(m, view.state, adviceOutput);
  if (view.state === "insufficient") return fill(m.status.summaryAriaNone, { label });
  if (view.state === "broken") return fill(m.status.summaryAriaBroken, { label });
  return fill(m.status.summaryAria, { label, step: (view.position ?? 0) + 1, points: view.points ?? 0, known: view.coverage.pointsKnown });
}

/** Split a template at {points}; null marks where the number goes. */
function pointsParts(template: string): (string | null)[] {
  return template.split("{points}").flatMap((part, index) => (index === 0 ? [part] : [null, part]) as (string | null)[]);
}

const ruleWeights = new Map<string, number>(ruleGroups.flatMap((group) => group.rules.map((rule) => [rule.id, rule.points] as const)));

/** "Data: 19 of 25 points" and the rules that had no data. Unknown rules are never shown as 0. */
export function StatusCoverage({ view, m, adviceOutput }: { view: StatusView; m: Messages; adviceOutput: boolean }) {
  if (view.state === "insufficient") return null;
  const { pointsKnown, unknownRules } = view.coverage;
  const full = unknownRules.length === 0;
  // EN45 coverage guard: under 20 evidenced points the best band is Watch.
  const cap = !full && view.coverage.incomplete && view.state !== "broken";
  return (
    <div className={styles.coverage} data-complete={full ? "" : undefined}>
      <p className={styles.coverageLine}>
        {full ? <IconCheck /> : <IconNoData />}
        <span className={styles.coverageMain}>{full ? m.status.dataFull : fill(m.status.dataSome, { known: pointsKnown })}</span>
        {!full && (
          <span className={styles.coverageRules}>
            {m.status.dataMissing.split("{rules}")[0]}
            {unknownRules.map((id: RuleId, index) => (
              <span key={id}>
                {index > 0 ? ", " : ""}
                <a className={styles.ruleLink} href={`#rule-${id}`}>{m.status.ruleShort[id]} ({ruleWeights.get(id)})</a>
              </span>
            ))}
          </span>
        )}
      </p>
      {cap && <p className={styles.cap}>{fill(m.status.coverageCap, { setup: statusLabel(m, "setup", adviceOutput) })}</p>}
    </div>
  );
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
}

/** Header of the company page: label, points, track, coverage, chips. */
export function StatusPanel({ view, m, adviceOutput, asOf, methodHref, reasons, groups, pullbackLabel, disclaimer, describedBy }: StatusPanelProps) {
  const label = statusLabel(m, view.state, adviceOutput);
  const scored = view.state !== "insufficient";
  const broken = view.state === "broken";
  return (
    <section className={styles.panel} data-state={view.state} aria-labelledby="status-title">
      <div className={styles.row}>
        <div className={styles.lead}>
          <h2 id="status-title" className={styles.label} aria-describedby={describedBy}>
            <StatusIcon state={view.state} />
            <span className={styles.labelText}>{label}</span>
            {pullbackLabel ? <span className={styles.qualifier}>{pullbackLabel}</span> : null}
          </h2>
          <p className={styles.sub}>
            {asOf ? <span>{fill(m.status.asOf, { date: asOf })}</span> : null}
            <a className={styles.methodLink} href={methodHref}>{m.status.methodLink}</a>
          </p>
        </div>
        {scored && view.points !== null ? (
          <div className={styles.points}>
            <p className={styles.pointsLine}>
              {pointsParts(broken ? m.status.pointsNotCounted : m.status.points).map((part, index) => part === null
                ? (broken ? <s key={index} className="num">{view.points}</s> : <span key={index} className={`${styles.pointsNum} num`}>{view.points}</span>)
                : <span key={index}>{part}</span>)}
            </p>
            {groups && (
              <p className={`${styles.groups} num`}>
                {groups.map((group) => (
                  <span key={group.short}><abbr title={group.name}>{group.short}</abbr> {group.score}/{group.max}{group.noData ? `, ${fill(m.status.groupNoData, { n: group.noData })}` : ""}</span>
                ))}
              </p>
            )}
          </div>
        ) : null}
      </div>
      <p className="visually-hidden" id="status-summary">{summarySentence(view, m, adviceOutput)}</p>
      <StatusTrack view={view} m={m} adviceOutput={adviceOutput} />
      {reasons.length > 0 && (broken || !scored) ? <p className={styles.because}>{fill(broken ? m.status.brokenBecause : m.status.insufficientBecause, { reasons: reasons.join("; ") })}</p> : null}
      <StatusCoverage view={view} m={m} adviceOutput={adviceOutput} />
      <ConfirmationChips view={view} m={m} />
      {disclaimer}
    </section>
  );
}
