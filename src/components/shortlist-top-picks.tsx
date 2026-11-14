import Link from "next/link";
import type { ShortlistData } from "@/data/shortlist";
import { orderedRows, widenedThemes, type LensedRow, type ModelLens } from "@/engine/model-lens";
import type { ShortlistRow } from "@/engine/shortlist";
import { SHORTLIST_CONFIG } from "@/engine/shortlist-config";
import { fill, formatDate, formatScorePercent, getMessages, intlTag, type Locale } from "@/i18n";
import { getShortlistTopMessages, themeLabel } from "@/i18n/shortlist-top-messages";
import { rowMarkers, sectorGroupLabel, ShortlistView, tieBreakValue } from "./shortlist-view";
import styles from "./shortlist-view.module.css";

/** Model weight as text: whole percent for customers, one decimal for the owner. */
export function weightText(locale: Locale, value: number, exact: boolean): string {
  const n = new Intl.NumberFormat(intlTag[locale], { maximumFractionDigits: exact ? 1 : 0, minimumFractionDigits: exact ? 1 : 0 }).format(value);
  return locale === "sk" ? `${n} %` : `${n}%`;
}

const isLensed = (row: ShortlistRow | LensedRow): row is LensedRow => "lens" in row;

/** Why the row sits where it does: first, placed by the lens, or the tie-breaker against the row above with its value. */
export function rankReason(locale: Locale, row: ShortlistRow | LensedRow): string {
  const t = getShortlistTopMessages(locale);
  const m = getMessages(locale).shortlist;
  if (isLensed(row) && row.placedByLens) return fill(t.placedByLens, { cap: SHORTLIST_CONFIG.themeCapPercent });
  if (row.rank === 1 || row.decidedBy === null) return t.first;
  const value = tieBreakValue(locale, row, row.decidedBy);
  return `${t.orderBy}: ${m.tieBreaks[row.decidedBy]}${value ? ` · ${value}` : ""}`;
}

/** The lens facts of one row as plain text lines; empty without a lens. */
export function lensLines(locale: Locale, row: ShortlistRow | LensedRow, exact: boolean): string[] {
  if (!isLensed(row) || !row.lens) return [];
  const t = getShortlistTopMessages(locale);
  const c = SHORTLIST_CONFIG;
  const theme = themeLabel(locale, row.theme);
  const lines = [fill(t.status[row.lens.status], { theme, weight: weightText(locale, row.lens.themeWeightPercent, exact), cap: c.themeCapPercent })];
  if (row.lens.sectorOverCap) lines.push(fill(t.sectorOver, { sector: sectorGroupLabel(locale, row.sector), weight: weightText(locale, row.lens.sectorWeightPercent, exact), cap: c.sectorGroupCapPercent }));
  return lines;
}

/** "Model portfolio: 38% Cloud and software, 27% AI and semiconductors." plus the themes the shown names widen it with. */
export function lensSummary(locale: Locale, lens: ModelLens, shown: readonly (ShortlistRow | LensedRow)[], exact: boolean): string[] {
  const t = getShortlistTopMessages(locale);
  const cap = SHORTLIST_CONFIG.themeCapPercent;
  const list = (items: string[]) => new Intl.ListFormat(intlTag[locale], { type: "conjunction" }).format(items);
  const lines = [lens.overThemes.length
    ? fill(t.lensLine, { themes: list(lens.overThemes.map((share) => `${weightText(locale, share.weightPercent, exact)} ${themeLabel(locale, share.key)}`)) })
    : fill(t.lensNoOver, { cap })];
  const widened = widenedThemes(shown);
  if (widened.length) lines.push(fill(t.lensWiden, { themes: list(widened.map((theme) => themeLabel(locale, theme))) }));
  return lines;
}

/**
 * Top picks block (S1): the first `limit` shortlist names in lens order with the reason each sits where it does, the model portfolio
 * lens line, then the full shortlist and every Setup met name collapsed. `variant="scanner"` puts the full grouped view inside the
 * first collapsed part; the dashboard shows a plain ranked list there and links to the scanner. Informational wording only.
 */
export function ShortlistTopPicks({ locale, data, limit, variant }: { locale: Locale; data: ShortlistData; limit: number; variant: "scanner" | "dashboard" }) {
  const t = getShortlistTopMessages(locale);
  const m = getMessages(locale);
  const state = m.status.labels.setup;
  const exact = data.exactWeights === true;
  const rows = orderedRows(data.shortlist.kept, data.lens);
  const top = rows.slice(0, limit);
  const candidates = [...data.shortlist.kept, ...data.shortlist.dropped].map((row) => row.ticker).sort();
  return <section className={styles.shortlist} aria-labelledby="shortlist-top-title" id={variant === "scanner" ? "shortlist" : undefined} data-shortlist="top">
    <div className={styles.head}>
      <h2 className={styles.title} id="shortlist-top-title">{t.title}</h2>
      <p className={styles.summary}>{fill(t.summary, { n: top.length, kept: rows.length, candidates: data.shortlist.candidates, state })}</p>
    </div>
    <p className={styles.note}>{fill(t.lede, { cap: SHORTLIST_CONFIG.themeCapPercent })}</p>
    {top.length ? <ol className={styles.picks}>{top.map((row) => <li key={row.ticker} data-ticker={row.ticker} data-lens={isLensed(row) ? row.lens?.status : undefined}>
      <div className={styles.pickHead}>
        <span className={styles.rank}>{row.rank}.</span>
        <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link>
        <span className="company-name">{data.names[row.ticker] ?? ""}</span>
        {row.percent === null ? null : <span className={styles.pickScore}>{formatScorePercent(locale, row.percent)}</span>}
      </div>
      <p className={styles.pickMeta}>{t.theme}: {themeLabel(locale, row.theme)} · {sectorGroupLabel(locale, row.sector)}</p>
      <p className={styles.pickReason}>{rankReason(locale, row)}</p>
      {lensLines(locale, row, exact).map((line) => <p key={line} className={styles.pickMeta}>{line}</p>)}
      {rowMarkers(locale, row).length ? <span className={styles.markers}>{rowMarkers(locale, row).map((text) => <span key={text} className="tag">{text}</span>)}</span> : null}
    </li>)}</ol> : <p className={styles.note}>{fill(t.empty, { state })}</p>}
    <div className={styles.group} data-lens-summary={data.lens ? "on" : "off"}>
      <h3 className={styles.groupTitle}>{t.lensTitle}</h3>
      {data.lens ? <>
        {lensSummary(locale, data.lens, top, exact).map((line) => <p key={line} className={styles.lensLine}>{line}</p>)}
        <p className={styles.note}>{fill(exact ? t.lensSourceOwner : t.lensSourcePublic, { date: formatDate(locale, data.lens.weights.asOf) })}</p>
      </> : <p className={styles.note}>{t.lensMissing}</p>}
    </div>
    {rows.length > top.length || variant === "scanner" ? <details className={styles.dropped} data-collapsed="shortlist">
      <summary>{fill(t.fullShortlist, { count: rows.length })}</summary>
      {variant === "scanner"
        ? <ShortlistView locale={locale} data={data} nested />
        : <ol className={styles.compact}>{rows.map((row) => <li key={row.ticker}>
          <span className={styles.rank}>{row.rank}.</span>
          <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link>
          <span className="muted">{themeLabel(locale, row.theme)}</span>
          {row.percent === null ? null : <span>{formatScorePercent(locale, row.percent)}</span>}
        </li>)}</ol>}
    </details> : null}
    {candidates.length ? <details className={styles.dropped} data-collapsed="setup">
      <summary>{fill(t.allSetup, { state, count: candidates.length })}</summary>
      <p className={styles.tickers}>{candidates.map((ticker, index) => <span key={ticker}>{index ? ", " : ""}<Link className="ticker" href={`/${locale}/company/${ticker}`}>{ticker}</Link></span>)}</p>
    </details> : null}
    {variant === "dashboard" ? <p className={styles.note}><Link href={`/${locale}/stocks#shortlist`}>{t.more}</Link></p> : null}
  </section>;
}
