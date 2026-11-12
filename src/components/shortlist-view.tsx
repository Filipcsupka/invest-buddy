import Link from "next/link";
import type { ShortlistData } from "@/data/shortlist";
import { decidingTieBreak, type ShortlistRow, type TieBreak } from "@/engine/shortlist";
import { SHORTLIST_CONFIG } from "@/engine/shortlist-config";
import { fill, formatNumber, formatScorePercent, getMessages, intlTag, type Locale } from "@/i18n";
import { getTierMessages } from "@/i18n/tier-messages";
import { isSectorGroup } from "@/universe/sector-groups";
import { TierLock } from "./tier-lock";
import styles from "./shortlist-view.module.css";

/** Localized sector group name; an unknown key is shown as given. */
export function sectorGroupLabel(locale: Locale, group: string): string {
  return isSectorGroup(group) ? getMessages(locale).shortlist.groups[group] : group;
}

const setupLabel = (locale: Locale) => getMessages(locale).status.labels.setup;

/** "RS percentile 92", "Daily range 2.1%", ... for the key that ordered the row. */
export function tieBreakValue(locale: Locale, row: ShortlistRow, key: TieBreak | null): string | null {
  const m = getMessages(locale).shortlist;
  if (key === "percent") return row.percent === null ? null : formatScorePercent(locale, row.percent);
  if (key === "coverage") return row.evidencedPoints === null ? null : fill(m.coverage, { n: row.evidencedPoints });
  if (key === "rs") return row.rsPercentile === null ? null : fill(m.rsValue, { n: row.rsPercentile });
  if (key === "atr") return row.atrPercent === null ? null : fill(m.atrValue, { n: formatNumber(locale, row.atrPercent, 1) });
  if (key === "tradedValue") return row.tradedValueUsd === null ? null : fill(m.tradedValue, { n: new Intl.NumberFormat(intlTag[locale], { notation: "compact", maximumFractionDigits: 1 }).format(row.tradedValueUsd) });
  return null;
}

/**
 * Order labels for rows shown inside one sector group: the tie-breaker against the row above in the same table. The first row of a
 * group says it is first in the group, unless it is first overall.
 */
export function groupOrder(rows: readonly ShortlistRow[]): { row: ShortlistRow; key: TieBreak | null; first: "overall" | "group" | null }[] {
  return rows.map((row, index) => index === 0
    ? { row, key: null, first: row.rank === 1 ? "overall" : "group" }
    : { row, key: decidingTieBreak(rows[index - 1], row), first: null });
}

/** Flags and not-assessed markers of one row, as plain text. */
export function rowMarkers(locale: Locale, row: ShortlistRow): string[] {
  const m = getMessages(locale).shortlist;
  const c = SHORTLIST_CONFIG;
  const flags = row.flags.map((reason) => fill(m.reasons[reason], { n: reason === "REPORT_SOON" ? c.reportWithinSessions : c.maxDrawdownPercent }));
  const unknown = row.notAssessed.map((id) => `${m.checks[id]}: ${m.notAssessed}`);
  return [...flags, ...unknown];
}

/** The fixed method line, filled from the config. */
export function methodText(locale: Locale): string {
  const c = SHORTLIST_CONFIG;
  const volume = `${new Intl.NumberFormat(intlTag[locale], { notation: "compact", maximumFractionDigits: 1 }).format(c.minTradedValueUsd)} USD`;
  return fill(getMessages(locale).shortlist.method, {
    points: c.minEvidencedPoints, rsTop: 100 - c.minRsPercentile, sessions: c.rsSessions, volume,
    reportSessions: c.reportWithinSessions, drawdown: c.maxDrawdownPercent,
  });
}

function Lens({ locale, data }: { locale: Locale; data: ShortlistData }) {
  const m = getMessages(locale).shortlist;
  const { concentration } = data;
  if (!concentration.total) return null;
  return <div className={styles.group}>
    <h3 className={styles.groupTitle}>{m.concentrationTitle}</h3>
    <ul className={styles.lens}>{concentration.groups.map((group) => <li key={group.sector} data-flagged={group.flagged ? "true" : undefined}>
      {fill(m.concentration, { count: group.count, total: concentration.total, sector: sectorGroupLabel(locale, group.sector) })}
    </li>)}</ul>
    {concentration.groups.some((group) => group.flagged) && <p className="notice">{fill(m.concentrationFlag, { percent: concentration.thresholdPercent })}</p>}
    {concentration.unknownCount > 0 && <p className={styles.note}>{fill(m.unknownSector, { count: concentration.unknownCount, total: concentration.total })}</p>}
  </div>;
}

function RowTable({ locale, rows, names, label }: { locale: Locale; rows: ShortlistRow[]; names: Record<string, string>; label: string }) {
  const m = getMessages(locale).shortlist;
  return <div className="table-scroll" role="region" tabIndex={0} aria-label={label}><table className="screen">
    <thead><tr><th scope="col">{m.rank}</th><th scope="col">{m.name}</th><th scope="col">{m.percent}</th><th scope="col">{m.checksColumn}</th><th scope="col">{m.orderColumn}</th></tr></thead>
    <tbody>{groupOrder(rows).map(({ row, key, first }) => {
      const markers = rowMarkers(locale, row);
      const value = tieBreakValue(locale, row, key);
      return <tr key={row.ticker} data-ticker={row.ticker}>
        <td className="num">{row.rank}</td>
        <th scope="row"><Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link> <span className="company-name">{names[row.ticker] ?? ""}</span></th>
        <td className="num">{row.percent === null ? "–" : formatScorePercent(locale, row.percent)}{row.evidencedPoints === null ? null : <span className="muted small"> · {fill(m.coverage, { n: row.evidencedPoints })}</span>}</td>
        <td><span className={styles.markers}>{markers.length ? markers.map((text) => <span key={text} className="tag">{text}</span>) : "–"}</span></td>
        <td>{first === "overall" ? m.firstRow : first === "group" ? m.firstInGroup : key ? m.tieBreaks[key] : m.tieBreaks.ticker}{value ? <span className="muted small"> · {value}</span> : null}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

/**
 * Ranked shortlist grouped by sector group, with the concentration lens and the dropped names. `compact` is the dashboard block: the
 * lens and the first `limit` names, with a link to the scanner view. Informational wording only: no actions and no money.
 */
export function ShortlistView({ locale, data, compact = false, limit = 5 }: { locale: Locale; data: ShortlistData; compact?: boolean; limit?: number }) {
  const m = getMessages(locale).shortlist;
  const { shortlist } = data;
  const state = setupLabel(locale);
  const head = <div className={styles.head}>
    <h2 className={styles.title} id="shortlist-title">{m.title}</h2>
    <p className={styles.summary}>{fill(m.summary, { kept: shortlist.kept.length, candidates: shortlist.candidates, state })}</p>
  </div>;
  if (compact) {
    return <section className={styles.shortlist} aria-labelledby="shortlist-title" data-shortlist="compact">
      {head}
      {shortlist.kept.length ? <ol className={styles.compact}>{shortlist.kept.slice(0, limit).map((row) => <li key={row.ticker}>
        <span className={styles.rank}>{row.rank}.</span>
        <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link>
        <span className="muted">{sectorGroupLabel(locale, row.sector)}</span>
        {row.percent === null ? null : <span>{formatScorePercent(locale, row.percent)}</span>}
        {rowMarkers(locale, row).map((text) => <span key={text} className="tag">{text}</span>)}
      </li>)}</ol> : <p className={styles.note}>{fill(m.empty, { state })}</p>}
      <Lens locale={locale} data={data} />
      <p className={styles.note}><Link href={`/${locale}/scanner#shortlist`}>{m.more}</Link></p>
    </section>;
  }
  const groups = data.concentration.groups;
  return <section className={styles.shortlist} aria-labelledby="shortlist-title" id="shortlist" data-shortlist="full">
    {head}
    <p className={styles.note}>{fill(m.lede, { state })}</p>
    <Lens locale={locale} data={data} />
    {shortlist.kept.length ? groups.map((group) => {
      const label = sectorGroupLabel(locale, group.sector);
      return <div key={group.sector} className={styles.group}>
        <h3 className={styles.groupTitle}>{label} ({group.count})</h3>
        <RowTable locale={locale} rows={shortlist.kept.filter((row) => row.sector === group.sector)} names={data.names} label={`${m.title} · ${label}`} />
      </div>;
    }) : <p className={styles.note}>{fill(m.empty, { state })}</p>}
    {shortlist.dropped.length > 0 && <details className={styles.dropped}>
      <summary>{m.dropped} ({shortlist.dropped.length})</summary>
      <p className={styles.note}>{fill(m.droppedNote, { state })}</p>
      <ul>{shortlist.dropped.map((row) => <li key={row.ticker} data-ticker={row.ticker}>
        <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link> {row.dropReasons.map((reason) => m.reasons[reason]).join(" ")}
        {rowMarkers(locale, row).map((text) => <span key={text} className="tag">{text}</span>)}
      </li>)}</ul>
    </details>}
    <p className={styles.note}>{methodText(locale)}</p>
  </section>;
}

/** The lock card shown in place of the shortlist to a viewer without vendor-backed data. */
export function ShortlistLock({ locale }: { locale: Locale }) {
  const t = getTierMessages(locale);
  const m = getMessages(locale).shortlist;
  return <TierLock segmentId="scanner-shortlist" label={t.lockTitle} body={`${fill(m.lock, { state: setupLabel(locale) })} ${t.lockSuffix}`} />;
}
