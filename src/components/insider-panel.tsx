import Link from "next/link";
import type { InsiderEvent } from "@/db/insiders";
import { DataTable } from "@/components/kit";
import "./record-pages.css";
import { formatDate, formatNumber, getMessages, intlTag, type Locale } from "@/i18n";

const codes = ["P", "S", "A", "M", "F"] as const;
type Code = (typeof codes)[number];
const isCode = (value: string): value is Code => codes.some((code) => code === value);

/** Can be placed on the full feed or on a single company page. */
export function InsiderPanel({ locale, events, ticker }: { locale: Locale; events: InsiderEvent[]; ticker?: string }) {
  const m = getMessages(locale).insiders;
  const money = new Intl.NumberFormat(intlTag[locale], { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const role = (owner: Pick<InsiderEvent, "isDirector" | "isOfficer" | "isTenPercentOwner" | "isOther">) => {
    const labels = [owner.isDirector && m.director, owner.isOfficer && m.officer, owner.isTenPercentOwner && m.tenPercent, owner.isOther && m.other].filter(Boolean);
    return labels.length ? labels.join(", ") : m.unknown;
  };
  return <section className="sheet-section rp-insiders" aria-label={ticker ?? m.title}>
    {ticker && <h2>{ticker}</h2>}
    {events.length === 0 ? <p className="rp-empty">{m.empty}</p> : <DataTable label={ticker ?? m.title} density="compact">
      <thead><tr>
        <th scope="col">{m.date}</th>
        {!ticker && <th scope="col">{m.ticker}</th>}
        <th scope="col">{m.insider}</th>
        <th scope="col">{m.role}</th>
        <th scope="col">{m.event}</th>
        <th scope="col" className="num">{m.shares}</th>
        <th scope="col" className="num">{m.value}</th>
        <th scope="col">{m.sec}</th>
      </tr></thead>
      <tbody>{events.map((event) => {
        const owners = event.ownerName ? [{ name: event.ownerName, role: role(event) }] : event.reportingOwners.map((owner) => ({ name: owner.name, role: role(owner) }));
        return <tr key={`${event.accession}:${event.lineNo}`}>
          <td><time dateTime={event.transactionDate}>{formatDate(locale, event.transactionDate)}</time></td>
          {!ticker && <th scope="row"><Link href={`/${locale}/company/${encodeURIComponent(event.ticker)}`}>{event.ticker}</Link></th>}
          <td>{owners.map((owner) => owner.name ?? m.unknown).join(", ") || m.unknown}</td>
          <td>{owners.map((owner) => owner.role).join("; ") || m.unknown}</td>
          <td>{isCode(event.code) ? m.codes[event.code] : event.code}</td>
          <td className="num">{formatNumber(locale, event.shares, Number.isInteger(event.shares) ? 0 : 2)}</td>
          <td className="num">{event.value === null ? m.notReported : money.format(event.value)}</td>
          <td>{event.secUrl ? <a href={event.secUrl} target="_blank" rel="noopener noreferrer" aria-label={`${m.openSec}: ${event.ticker}, ${formatDate(locale, event.filedAt)}`}>SEC</a> : null}</td>
        </tr>;
      })}</tbody>
    </DataTable>}
  </section>;
}
