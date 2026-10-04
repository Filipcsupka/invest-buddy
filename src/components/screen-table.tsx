import Link from "next/link";
import { getMessages, type Locale } from "@/i18n";
import { ScoreMark } from "./score-mark";
import { StateChip } from "./score-badge";
import type { ScreenRow } from "./view-model";

export type Column = "date" | "company" | "sector" | "score" | "state" | "reason";

/** Dense, read-only screen table. The caption carries the disclaimer every score must sit beside. */
export function ScreenTable({ locale, rows, columns, caption, disclaimerId }: { locale: Locale; rows: ScreenRow[]; columns: Column[]; caption: React.ReactNode; disclaimerId: string }) {
  const m = getMessages(locale);
  const has = (column: Column) => columns.includes(column);
  return (
    <div className="table-scroll">
      <table className="screen">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {has("date") ? <th scope="col">{m.table.date}</th> : null}
            <th scope="col">{m.table.ticker}</th>
            {has("sector") ? <th scope="col" className="col-sector">{m.table.sector}</th> : null}
            {has("score") ? (
              <th scope="col" className="col-score">
                {m.table.score}
              </th>
            ) : null}
            {has("score") ? <th scope="col" className="col-mark">{m.table.rules}</th> : null}
            {has("state") ? <th scope="col">{m.table.state}</th> : null}
            {has("reason") ? <th scope="col" className="col-reason">{m.table.criteria}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.date}-${row.ticker}`} data-state={row.state}>
              {has("date") ? <td className="num nowrap">{row.dateLabel}</td> : null}
              <th scope="row" className="col-company">
                <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>
                  {row.ticker}
                </Link>
                <span className="company-name">
                  {row.name}
                  {row.agreementLabel ? <span className="tag" title={m.agreement.title}>{row.agreementLabel}</span> : null}
                  {row.extension ? <span className="tag">{m.common.extension}</span> : null}
                </span>
              </th>
              {has("sector") ? <td className="col-sector muted">{row.sector}</td> : null}
              {has("score") ? (
                <td className="col-score num" aria-describedby={disclaimerId}>
                  {row.state === "insufficient" ? <span className="muted">{m.common.noScore}</span> : row.total}
                </td>
              ) : null}
              {has("score") ? (
                <td className="col-mark">
                  <ScoreMark matched={row.matched} state={row.state} label={row.markLabel} />
                </td>
              ) : null}
              {has("state") ? (
                <td>
                  <StateChip state={row.state} label={row.stateLabel} pullbackLabel={row.pullbackLabel} describedBy={disclaimerId} />
                </td>
              ) : null}
              {has("reason") ? <td className="col-reason muted">{row.reasons.length ? row.reasons.join("; ") : m.table.noRejection}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
