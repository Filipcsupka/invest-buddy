import Link from "next/link";
import { DataTable } from "@/components/kit";
import type { CongressTrade } from "@/db/congress";
import { fill, formatDate, type Locale } from "@/i18n";
import { getFlowMessages } from "@/i18n/flow-messages";
import styles from "../economy/flow.module.css";

/** Disclosures table, modelled on the insider panel. Amounts are the ranges as filed; each row links its filing. Leave `ticker` unset on the full feed. */
export function CongressTable({ locale, trades, ticker, label }: { locale: Locale; trades: CongressTrade[]; ticker?: string; label: string }) {
  const m = getFlowMessages(locale);
  const c = m.congress, dash = m.common.dash;
  const memberHref = (trade: CongressTrade) => `/${locale}/congress?member=${encodeURIComponent(trade.bioguideId ?? trade.memberName)}`;
  return <DataTable label={label} density="compact">
    <thead><tr>
      <th scope="col">{c.disclosed}</th>
      <th scope="col">{c.traded}</th>
      <th scope="col">{c.member}</th>
      {!ticker && <th scope="col">{c.asset}</th>}
      <th scope="col">{c.type}</th>
      <th scope="col">{c.owner}</th>
      <th scope="col">{c.amount}</th>
      <th scope="col">{c.filing}</th>
    </tr></thead>
    <tbody>{trades.map((trade) => <tr key={trade.key}>
      <td className={styles.when}><time dateTime={trade.disclosureDate}>{formatDate(locale, trade.disclosureDate)}</time>{trade.isLate ? <span className={styles.late} title={c.lateNote}>{c.late}</span> : null}</td>
      <td className={styles.when}>{trade.txDate ? <time dateTime={trade.txDate}>{formatDate(locale, trade.txDate)}</time> : dash}</td>
      <th scope="row">
        <Link href={memberHref(trade)}>{trade.memberName}</Link>
        <span className={styles.muted}> ({[c.chambers[trade.chamber], trade.state].filter(Boolean).join(", ")})</span>
      </th>
      {!ticker && <td>
        {trade.symbol ? <Link className={styles.chip} href={`/${locale}/congress?ticker=${encodeURIComponent(trade.symbol)}`}>{trade.symbol}</Link> : null}
        {trade.assetDescription ? <span className={styles.muted}> {trade.assetDescription}</span> : trade.symbol ? null : dash}
      </td>}
      <td>{trade.txType ? c.types[trade.txType] ?? trade.txType : dash}</td>
      <td>{trade.owner ?? dash}</td>
      <td className={styles.when}>{trade.amountRange ?? dash}</td>
      <td>{trade.filingUrl ? <a href={trade.filingUrl} target="_blank" rel="noopener noreferrer" aria-label={fill(c.openFiling, { member: trade.memberName, date: formatDate(locale, trade.disclosureDate) })}>PDF</a> : dash}</td>
    </tr>)}</tbody>
  </DataTable>;
}
