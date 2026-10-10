import type { ScoreHistoryRow } from "@/db/history";
import { fill, formatDate, getMessages, type Locale } from "@/i18n";
import { stateKey, type StateKey } from "@/i18n/score-text";
import type { AlertState } from "@/engine";

const W = 600;
const H = 160;
const MAX = 25;

/** Total score per scan day as a line, with the same numbers in a table. Rows come newest first. */
export function ScoreHistory({ ticker, rows, locale }: { ticker: string; rows: ScoreHistoryRow[]; locale: Locale }) {
  const m = getMessages(locale);
  const h = m.company.history;
  const stateLabel = (state: string) => { const key = stateKey(state as AlertState) as StateKey | undefined; return key ? m.states[key] : state; };
  const ordered = [...rows].sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (ordered.length === 0) return <p className="muted">{h.empty}</p>;
  const x = (i: number) => (i / (ordered.length - 1)) * W;
  const y = (v: number) => H - (v / MAX) * H;
  const line = ordered.map((row, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(row.total).toFixed(1)}`).join("");
  const chart = ordered.length >= 2;
  return (
    <div className="score-history">
      {chart ? (
        <figure className="chart">
          <div className="chart-plot" role="img" aria-label={fill(h.chartLabel, { ticker, count: ordered.length, first: formatDate(locale, ordered[0].asOf), last: formatDate(locale, ordered[ordered.length - 1].asOf) })}>
            <svg className="chart-layer" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {[0, 5, 10, 15, 20, 25].map((tick) => <line key={tick} x1="0" x2={W} y1={y(tick)} y2={y(tick)} className="chart-grid" vectorEffect="non-scaling-stroke" />)}
              <path d={line} className="line-close" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </figure>
      ) : <p className="muted">{h.empty}</p>}
      <details>
        <summary>{h.tableLabel}</summary>
        <table className="rule-table">
          <thead>
            <tr>
              <th scope="col">{h.date}</th>
              <th scope="col" className="num">{h.total}</th>
              <th scope="col" className="num">{h.fundamentals}</th>
              <th scope="col" className="num">{h.technical}</th>
              <th scope="col" className="num">{h.macro}</th>
              <th scope="col">{h.state}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.asOf}>
                <th scope="row" className="num">{formatDate(locale, row.asOf)}</th>
                <td className="num">{row.total}</td>
                <td className="num">{row.fundamentals}</td>
                <td className="num">{row.technical}</td>
                <td className="num">{row.macro}</td>
                <td>{stateLabel(row.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
