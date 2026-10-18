import Link from "next/link";
import { fill, getMessages, type Locale } from "@/i18n";
import { StatusCell } from "./status-slider";
import type { ScreenRow } from "./view-model";

export type Column = "date" | "company" | "sector" | "score" | "state" | "reason";

/** Dense, read-only screen table. The caption carries the disclaimer every score must sit beside. */
export function ScreenTable({ locale, rows, columns, caption, disclaimerId, label }: { locale: Locale; rows: ScreenRow[]; columns: Column[]; caption: React.ReactNode; disclaimerId: string; label?: string }) {
  const m = getMessages(locale);
  const has = (column: Column) => columns.includes(column);
  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label={label ?? m.dashboard.title}>
      <table className="screen screen-fixed">
        <caption>{caption}</caption>
        <colgroup>
          {has("date") ? <col className="sc-date" /> : null}
          <col className="sc-company" />
          {has("sector") ? <col className="sc-sector" /> : null}
          {has("score") ? <col className="sc-score" /> : null}
          {has("state") ? <col className="sc-state" /> : null}
          {has("reason") ? <col /> : null}
        </colgroup>
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
            {has("state") ? <th scope="col">{m.status.columns.status}</th> : null}
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
              {has("score") ? <td className="col-score num" aria-describedby={disclaimerId}>{row.percent === null ? <span className="muted">{m.common.noScore}</span> : <>{row.percentLabel}<span className="small muted"> {row.bonusLabel}</span><span className="small muted">{` · ${fill(m.status.coreData, { known: row.pointsKnown, total: row.coreTotal })}`}</span></>}</td> : null}
              {has("state") ? (
                <td>
                  <StatusCell state={row.state} position={row.position} label={row.stateLabel} ariaLabel={row.statusAria} pullbackLabel={row.pullbackLabel} describedBy={disclaimerId} />
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
