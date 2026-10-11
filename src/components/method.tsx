import { fill, getMessages, type Locale } from "@/i18n";
import { ruleGroups } from "@/i18n/rules";
import { MiniTrack, StatusIcon, statusLabel, steps } from "./status-slider";
import styles from "./status-slider.module.css";

/** The published rule book: ten rules in three groups, with their points. */
export function RuleBook({ locale, definitions = false }: { locale: Locale; definitions?: boolean }) {
  const m = getMessages(locale);
  return (
    <table className="rulebook">
      <caption className="visually-hidden">{m.methodology.scoreTitle}</caption>
      <thead className="visually-hidden">
        <tr>
          <th scope="col">{m.table.rules}</th>
          <th scope="col">{m.common.points}</th>
        </tr>
      </thead>
      {ruleGroups.map((group) => (
        <tbody key={group.group}>
          <tr className="rulebook-group">
            <th scope="rowgroup" colSpan={1}>
              {m.groups[group.group]}
            </th>
            <td className="num">{fill(m.methodology.groupMax, { max: group.max })}</td>
          </tr>
          {group.rules.map((rule) => (
            <tr key={rule.id}>
              <th scope="row">
                <span className="rule-name">{m.rules[rule.id]}</span>
                {definitions ? <span className="rule-def">{m.ruleDefinitions[rule.id]}</span> : null}
              </th>
              <td className="num rule-points">+{rule.points}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

const legendOrder = ["setup", "watch", "wait", "ignore", "broken", "insufficient"] as const;

/** The five steps plus gray: points, meaning, coverage and what the chips are. Top row is the highest step. */
export function StatusLegend({ locale, adviceOutput }: { locale: Locale; adviceOutput: boolean }) {
  const m = getMessages(locale);
  return (
    <div className="status-legend">
      <p className="prose">{m.status.legendLede}</p>
      <div className="table-scroll" role="region" tabIndex={0} aria-label={m.status.legendTitle}>
      <table className={styles.legend}>
        <caption className="visually-hidden">{m.status.legendTitle}</caption>
        <thead>
          <tr>
            <th scope="col">{m.status.legendStep}</th>
            <th scope="col">{m.status.columns.points}</th>
            <th scope="col">{m.status.legendMeaning}</th>
          </tr>
        </thead>
        <tbody>
          {legendOrder.map((state) => (
            <tr key={state} data-state={state}>
              <th scope="row">
                <span className={styles.cell} data-state={state}>
                  <MiniTrack position={state === "insufficient" ? null : steps.indexOf(state)} />
                  <StatusIcon state={state} />
                  <span className={styles.cellLabel}>{statusLabel(m, state, adviceOutput)}</span>
                </span>
              </th>
              <td className="num">{m.status.ranges[state]}</td>
              <td>
                {m.status.meaning[state]}
                {state === "broken" ? <> <a className={styles.legendLink} href="#rejection">{m.methodology.rejectionTitle}</a></> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <h3>{m.status.legendMissingTitle}</h3>
      <p className="prose">{m.status.legendMissing}</p>
      <h3>{m.status.legendConfirmTitle}</h3>
      <p className="prose">{m.status.legendConfirm}</p>
    </div>
  );
}

/** Static row of the five steps and gray for the home page. */
export function StatusSteps({ locale, adviceOutput }: { locale: Locale; adviceOutput: boolean }) {
  const m = getMessages(locale);
  return (
    <ol className={styles.stepRow}>
      {[...steps, "insufficient" as const].map((state, index) => (
        <li key={state}>
          <span className={styles.cell} data-state={state}>
            <MiniTrack position={state === "insufficient" ? null : index} />
            <StatusIcon state={state} />
            <span className={styles.cellLabel}>{statusLabel(m, state, adviceOutput)}</span>
          </span>
          <span className={styles.stepRange}>{m.status.ranges[state]}</span>
        </li>
      ))}
    </ol>
  );
}
