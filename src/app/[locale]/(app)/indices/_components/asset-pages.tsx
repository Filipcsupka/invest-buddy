import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n";
import type { AssetClass } from "@/db/asset-bars";
import type { AssetDetail, AssetSummary } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import { MarketPriceChart } from "@/components/market-price-chart";
import t from "@/components/etf/etf.module.css";
import { AssetTable } from "./asset-table";
import { day, level, signedRatio } from "./format";
import s from "./markets.module.css";

export const OwnerStamp = ({ locale }: { locale: Locale }) => <span className={s.owner}>{getMarketsMessages(locale).owner}</span>;

/** List of tracked indices. */
export function AssetListPage({ locale, title, lede, caption, basePath, rows, children }: { locale: Locale; title: string; lede: string; caption: string; basePath: string; rows: AssetSummary[]; children?: ReactNode }) {
  const m = getMarketsMessages(locale);
  return <div className="frame page">
    <RecordHead title={title} lede={lede} stamp={<OwnerStamp locale={locale} />} />
    <div className={t.stack}>
      <RecordCard id="assets" title={caption} flush>{rows.some((row) => row.last !== null) ? <AssetTable locale={locale} rows={rows} caption={caption} basePath={basePath} /> : <p className={t.note}>{m.noBars}</p>}</RecordCard>
      {children}
      <p className={t.note}>{m.factsOnly} {m.source}</p>
    </div>
  </div>;
}

/** Index detail with key figures, a price chart and optional extra sections. */
export function AssetDetailPage({ locale, assetClass, detail, lede, basePath, children }: { locale: Locale; assetClass: AssetClass; detail: AssetDetail; lede: string; basePath: string; children?: ReactNode }) {
  const m = getMarketsMessages(locale);
  const { summary, bars } = detail;
  const first = bars[0]?.date, last = bars.at(-1)?.date;
  return <div className="frame page">
    <RecordHead title={summary.name} lede={lede} stamp={<OwnerStamp locale={locale} />} meta={<span className="num">{summary.code}{summary.currency && summary.currency !== "NA" ? ` · ${summary.currency}` : ""}</span>}
      actions={<Link className="button secondary" href={`/${locale}/${basePath}`}>{m.back}</Link>} />
    <div className={t.stack}>
      {summary.last === null ? <p className={t.note}>{m.noBars}</p> : <>
        <KpiRow count={4}>
          <KpiCard label={m.lastClose} featured note={day(locale, summary.lastDate)}>{level(locale, assetClass, summary.last)}</KpiCard>
          <KpiCard label={m.change1d}>{signedRatio(locale, summary.change1d)}</KpiCard>
          <KpiCard label={m.change5d}>{signedRatio(locale, summary.change5d)}</KpiCard>
          <KpiCard label={m.changeYtd}>{signedRatio(locale, summary.changeYtd)}</KpiCard>
        </KpiRow>
        <RecordCard id="chart" title={m.chart} meta={<span className="num">{m.bars}: {bars.length}</span>}>
          <MarketPriceChart bars={bars} locale={locale} name={summary.name} count={260} />
          <dl className={t.facts}>
            <div><dt>{m.high52}</dt><dd className="num">{level(locale, assetClass, detail.high52)}</dd></div>
            <div><dt>{m.low52}</dt><dd className="num">{level(locale, assetClass, detail.low52)}</dd></div>
            <div><dt>{m.date}</dt><dd className="num">{first && last ? `${day(locale, first)} – ${day(locale, last)}` : m.noValue}</dd></div>
          </dl>
        </RecordCard>
      </>}
      {children}
      <p className={t.note}>{m.factsOnly} {m.source}</p>
    </div>
  </div>;
}
