import Link from "next/link";
import type { DashboardPeriod, DashboardPeriodRow, DashboardPeriodRows } from "@/data/cross-market-dashboard";
import { dashboardCopy } from "@/i18n/dashboard-messages";
import { formatDate, getMessages, type Locale } from "@/i18n";
import styles from "./period-highlights.module.css";

const number = (locale: Locale, value: number, signed = false) => `${new Intl.NumberFormat(locale === "sk" ? "sk-SK" : "en-US", { maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto" }).format(value)} %`;
const tabs: { key: DashboardPeriod; label: "periodToday" | "periodMonth" | "periodQuarter" | "periodYear" }[] = [
  { key: "1d", label: "periodToday" }, { key: "1m", label: "periodMonth" }, { key: "3m", label: "periodQuarter" }, { key: "1y", label: "periodYear" },
];

function ProductRows({ locale, rows, type }: { locale: Locale; rows: DashboardPeriodRow[]; type: "stocks" | "funds" | "indices" }) {
  const m = dashboardCopy(locale);
  if (!rows.length) return <p className={styles.empty}>{m.periodNoScores}</p>;
  return <ol className={styles.rows}>{rows.map((row) => {
    const href = type === "stocks" ? `/${locale}/company/${encodeURIComponent(row.code)}` : type === "funds" ? `/${locale}/etf/fund/${encodeURIComponent(row.code)}` : `/${locale}/indices/${encodeURIComponent(row.code)}`;
    return <li key={row.code} className={styles.row}>
      <div className={styles.rowHead}><Link href={href}>{row.name}</Link><span className={styles.code}>{type === "funds" ? "" : row.code}</span></div>
      <div className={styles.rowFacts}>
        {row.scorePercent !== null ? <span>{m.score} <strong>{number(locale, row.scorePercent)}</strong></span> : <span>{m.periodTrend} <strong>{row.trend === null ? m.noValue : row.trend ? m.above : m.below}</strong></span>}
        <span>{m.periodReturnShort} <strong>{row.priceStatus === "stale" ? m.periodStale : row.priceStatus === "gap" ? m.periodGap : row.returnPercent === null ? m.periodInsufficient : number(locale, row.returnPercent, true)}</strong></span>
      </div>
      <div className={styles.dates}>{row.scoreDate && <time dateTime={row.scoreDate}>{m.periodScoreDate}: {formatDate(locale, row.scoreDate)}</time>}
        {row.priceDate && <time dateTime={row.priceDate}>{m.periodPriceDate}: {formatDate(locale, row.priceDate)}</time>}</div>
    </li>;
  })}</ol>;
}

export function PeriodHighlights({ locale, period, rows, sample }: { locale: Locale; period: DashboardPeriod; rows: DashboardPeriodRows; sample: boolean }) {
  const m = dashboardCopy(locale);
  return <section className={styles.panel} aria-labelledby="period-highlights-title">
    <div className={styles.heading}><div><h2 id="period-highlights-title">{m.periodTitle}</h2><p>{m.periodLede}</p></div>{sample && <span className={styles.sample}>{getMessages(locale).common.sample}</span>}</div>
    <nav className={styles.tabs} aria-label={m.periodTitle}>{tabs.map((tab) => <Link key={tab.key} href={`/${locale}/dashboard?period=${tab.key}`} aria-current={period === tab.key ? "page" : undefined} className={period === tab.key ? styles.active : undefined}>{m[tab.label]}</Link>)}</nav>
    <p className={styles.returnNote}>{m.periodReturn}</p>
    <div className={styles.products}>
      <section><h3>{m.periodStocks}</h3><ProductRows locale={locale} rows={rows.stocks} type="stocks" /></section>
      <section><h3>{m.periodFunds}</h3><ProductRows locale={locale} rows={rows.funds} type="funds" /></section>
      <section><h3>{m.indices}</h3><ProductRows locale={locale} rows={rows.indices} type="indices" /></section>
    </div>
    <p className={styles.disclaimer}>{getMessages(locale).common.disclaimer}</p>
  </section>;
}
