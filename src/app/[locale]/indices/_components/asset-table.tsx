import Link from "next/link";
import type { Locale } from "@/i18n";
import type { AssetSummary } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import t from "@/components/etf/etf.module.css";
import { day, level, signedRatio } from "./format";
import { Sparkline } from "./sparkline";
import s from "./markets.module.css";

/** One row per tracked asset: last close, date, 1-day, 5-day and year-to-date change, and the last 30 closes. */
export function AssetTable({ locale, rows, caption, basePath }: { locale: Locale; rows: AssetSummary[]; caption: string; basePath: string }) {
  const m = getMarketsMessages(locale);
  return <div className={t.tableWrap}><table className={t.table}>
    <caption className="visually-hidden">{caption}</caption>
    <thead><tr>
      <th scope="col">{m.name}</th><th scope="col" className={s.right}>{m.lastClose}</th><th scope="col">{m.date}</th>
      <th scope="col" className={s.right}>{m.change1d}</th><th scope="col" className={s.right}>{m.change5d}</th><th scope="col" className={s.right}>{m.changeYtd}</th>
      <th scope="col">{m.trend30}</th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.symbol}>
      <th scope="row"><Link href={`/${locale}/${basePath}/${encodeURIComponent(row.code)}`}>{row.name}</Link><span className={s.code}>{row.code}{row.currency && row.currency !== "NA" ? ` · ${row.currency}` : ""}</span></th>
      <td className={s.right}>{level(locale, row.assetClass, row.last)}</td>
      <td>{day(locale, row.lastDate)}</td>
      <td className={s.right}>{signedRatio(locale, row.change1d)}</td>
      <td className={s.right}>{signedRatio(locale, row.change5d)}</td>
      <td className={s.right}>{signedRatio(locale, row.changeYtd)}</td>
      <td><Sparkline closes={row.spark} name={row.name} first={row.sparkFirst} last={row.lastDate} locale={locale} /></td>
    </tr>)}</tbody>
  </table></div>;
}
