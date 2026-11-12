import Link from "next/link";
import type { CrossMarketDashboard, DashboardFund, DashboardIndex } from "@/data/cross-market-dashboard";
import { dashboardCopy } from "@/i18n/dashboard-messages";
import { formatDate, getMessages, type Locale } from "@/i18n";
import { sectorGroupLabel } from "@/components/shortlist-view";
import styles from "./portfolio-structure.module.css";

const percent = (locale: Locale, value: number) => `${new Intl.NumberFormat(locale === "sk" ? "sk-SK" : "en-US", { maximumFractionDigits: 1 }).format(value)} %`;
const compact = (locale: Locale, value: number) => new Intl.NumberFormat(locale === "sk" ? "sk-SK" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value * 1_000_000);

function FundRows({ locale, funds }: { locale: Locale; funds: DashboardFund[] }) {
  const m = dashboardCopy(locale);
  if (!funds.length) return <p className={styles.empty}>{m.fundEmpty}</p>;
  return <ul className={styles.rows}>{funds.map((fund) => <li className={styles.row} key={fund.key}>
    <div className={styles.name}><Link href={`/${locale}/etf/fund/${encodeURIComponent(fund.key)}`}>{fund.name}</Link><span>{fund.symbol}{fund.trackedIndex ? ` · ${m.index} ${fund.trackedIndex}` : ""}</span></div>
    <div className={styles.facts}><span>{m.score} <strong>{percent(locale, fund.scorePercent)}</strong></span><span>{m.ter} <strong>{fund.terPercent === null ? m.noValue : percent(locale, fund.terPercent)}</strong></span><span>{m.aum} <strong>{fund.aumUsdM === null ? m.noValue : `USD ${compact(locale, fund.aumUsdM)}`}</strong></span></div>
    <time dateTime={fund.asOf}>{m.dataDate}: {formatDate(locale, fund.asOf)}</time>
  </li>)}</ul>;
}

function IndexRows({ locale, indices }: { locale: Locale; indices: DashboardIndex[] }) {
  const m = dashboardCopy(locale);
  if (!indices.length) return <p className={styles.empty}>{m.indexEmpty}</p>;
  return <ul className={styles.rows}>{indices.map((index) => <li className={styles.row} key={index.code}>
    <div className={styles.name}><Link href={`/${locale}/indices/${encodeURIComponent(index.code)}`}>{index.name}</Link><span>{index.code}</span></div>
    <div className={styles.facts}><span>{m.ma200} <strong>{index.aboveMa200 === null ? m.noValue : index.aboveMa200 ? m.above : m.below}</strong></span><span>{m.oneYear} <strong>{index.return1y === null ? m.noValue : percent(locale, index.return1y)}</strong></span><span>{m.volatility} <strong>{index.volatility1y === null ? m.noValue : percent(locale, index.volatility1y)}</strong></span></div>
    <time dateTime={index.asOf}>{m.dataDate}: {formatDate(locale, index.asOf)}</time>
  </li>)}</ul>;
}

export function PortfolioStructure({ locale, data }: { locale: Locale; data: CrossMarketDashboard }) {
  const m = dashboardCopy(locale);
  const common = getMessages(locale).common;
  const flagged = data.concentration.groups.filter((group) => group.flagged);
  return <>
    <section className={styles.panel} aria-labelledby="portfolio-structure-title">
      <header className={styles.head}><div><h2 id="portfolio-structure-title">{m.title}</h2><p>{m.lede}</p></div>{data.sample && <span className={styles.sample}>{common.sample}</span>}</header>
      <div className={styles.sleeves}>
        <section className={styles.sleeve} aria-label={m.growth}><h3>{m.growth}</h3>
          {data.stocks.length ? <ul className={styles.rows}>{data.stocks.map((stock) => <li className={styles.row} key={stock.ticker}>
            <div className={styles.name}><Link href={`/${locale}/company/${encodeURIComponent(stock.ticker)}`}>{stock.name}</Link><span>{stock.ticker} · {sectorGroupLabel(locale, stock.sector)}</span></div>
            <div className={styles.facts}><span>{m.score} <strong>{percent(locale, stock.scorePercent)}</strong></span></div>
            <time dateTime={stock.asOf}>{m.dataDate}: {formatDate(locale, stock.asOf)}</time>
          </li>)}</ul> : <p className={styles.empty}>{m.stockEmpty}</p>}
          {flagged.map((group) => <p className={styles.check} key={group.sector}>{m.concentration(group.count, data.concentration.total, sectorGroupLabel(locale, group.sector))}</p>)}
          {data.concentration.unknownCount > 0 && <p className={styles.note}>{m.unknownSector(data.concentration.unknownCount)}</p>}
        </section>
        <section className={styles.sleeve} aria-label={m.core}><h3>{m.core}</h3><FundRows locale={locale} funds={data.core} /></section>
        <section className={styles.sleeve} aria-label={m.defensive}><h3>{m.defensive}</h3><FundRows locale={locale} funds={data.defensive} /></section>
        <section className={styles.sleeve} aria-label={m.indices}><h3>{m.indices}</h3><IndexRows locale={locale} indices={data.indices} /></section>
        <section className={styles.sleeve} aria-label={m.cash}><h3>{m.cash}</h3><p className={styles.cash}>{m.cashNote}</p></section>
      </div>
      <footer className={styles.footer}><p>{m.scoreNote}</p><p>{common.disclaimer}</p></footer>
    </section>
    <aside className={styles.references} aria-labelledby="structure-references-title"><div><h2 id="structure-references-title">{m.referenceTitle}</h2><p>{m.referenceLede}</p></div>
      <ul><li><strong>{m.coreSatellite}</strong><span>{m.coreSatelliteBody}</span><a href="https://fund-docs.vanguard.com/AU-Adviser_guide-Vanguard_Core-Satellite_Model_Portfolios_with_LIS.pdf" target="_blank" rel="noopener noreferrer">{m.source}</a></li>
        <li><strong>{m.threeFund}</strong><span>{m.threeFundBody}</span><a href="https://oreilly.com/library/view/the-bogleheads-guide/9781119487333/c03.xhtml" target="_blank" rel="noopener noreferrer">{m.source}</a></li>
        <li><strong>{m.sixtyForty}</strong><span>{m.sixtyFortyBody}</span><a href="https://corporate.vanguard.com/content/dam/corp/research/pdf/rational_rebalancing_analytical_approach_to_multiasset_portfolio_rebalancing.pdf" target="_blank" rel="noopener noreferrer">{m.source}</a></li></ul>
    </aside>
  </>;
}
