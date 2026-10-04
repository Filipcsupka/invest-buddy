import { fill, getMessages, type Locale } from "@/i18n";
import { ruleGroups } from "@/i18n/rules";
import { StateChip } from "./score-badge";

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

/** The 0 to 25 scale, drawn to proportion, with the two states that override it. */
export function StateScale({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const bands = [
    { key: "ignore", from: 0, to: 11 },
    { key: "wait", from: 12, to: 14 },
    { key: "watch", from: 15, to: 17 },
    { key: "setup", from: 18, to: 25 },
  ] as const;
  return (
    <div className="scale">
      <ol className="scale-bands">
        {bands.map((band) => (
          <li key={band.key} style={{ flexGrow: band.to - band.from + 1, "--span": band.to - band.from + 1 } as React.CSSProperties} data-state={band.key}>
            <span className="scale-bar" aria-hidden="true" />
            <StateChip state={band.key} label={m.states[band.key]} />
            <span className="scale-range num">{m.stateRanges[band.key]}</span>
          </li>
        ))}
      </ol>
      <div className="scale-axis num" aria-hidden="true">
        {[0, 12, 15, 18, 25].map((tick) => (
          <span key={tick} style={{ left: `${(tick / 26) * 100}%` }}>
            {tick}
          </span>
        ))}
      </div>
      <dl className="scale-overrides">
        <div>
          <dt>
            <StateChip state="watch" label={m.states.watch} pullbackLabel={m.states.pullback} />
          </dt>
          <dd>{m.stateRanges.pullback}</dd>
        </div>
        <div>
          <dt>
            <StateChip state="broken" label={m.states.broken} />
          </dt>
          <dd>{m.stateRanges.broken}</dd>
        </div>
        <div>
          <dt>
            <StateChip state="insufficient" label={m.states.insufficient} />
          </dt>
          <dd>{m.stateRanges.insufficient}</dd>
        </div>
      </dl>
    </div>
  );
}
