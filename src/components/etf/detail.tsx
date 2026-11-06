import Link from "next/link";
import type { EtfDetailView, ExposureKind } from "@/db/etf-detail";
import type { CatalogFund } from "@/db/etf-catalog";
import { formatDate, formatNumber, type Locale } from "@/i18n";
import { getEtfDetailMessages, getEtfMessages } from "@/i18n/etf-messages";
import { RecordCard } from "@/components/record-parts";
import { DataTable, DataTableEmpty } from "@/components/kit/data-table";
import { MarketPriceChart } from "@/components/market-price-chart";
import { ETF_TABS, etfTabHref, type EtfTab } from "./tabs";
import s from "./etf.module.css";

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
/** Vendor gaps read "No data"; a stored zero stays a zero. */
export const pct = (locale: Locale, value: number | null, digits = 2) => value === null ? getEtfDetailMessages(locale).noData : `${formatNumber(locale, value, digits)} %`;
const signed = (locale: Locale, value: number | null) => value === null ? getEtfDetailMessages(locale).noData : `${value > 0 ? "+" : ""}${formatNumber(locale, value, 2)} %`;
const plain = (locale: Locale, value: number | null, digits = 2) => value === null ? getEtfDetailMessages(locale).noData : formatNumber(locale, value, digits);
const dated = (locale: Locale, value: string | null) => value ? formatDate(locale, value) : getEtfDetailMessages(locale).noData;
const textOr = (locale: Locale, value: string | null) => value || getEtfDetailMessages(locale).noData;

export function EtfTabNav({ locale, listingKey, active }: { locale: Locale; listingKey: string; active: EtfTab }) {
  const m = getEtfDetailMessages(locale);
  return <nav className={`kit-tabs ${s.tabs}`} aria-label={m.tabsLabel}>
    {ETF_TABS.map((tab) => <Link key={tab} href={etfTabHref(locale, listingKey, tab)} aria-current={tab === active ? "page" : undefined}>{m[tab]}</Link>)}
  </nav>;
}

export function OverviewPanel({ locale, fund, view }: { locale: Locale; fund: CatalogFund; view: EtfDetailView }) {
  const m = getEtfDetailMessages(locale), e = getEtfMessages(locale);
  const st = view.stats;
  const assets = st?.totalAssets ?? null;
  return <div className={s.stack}>
    <RecordCard id="etf-price" title={m.priceChart} meta={view.vendorSymbol ?? undefined}>
      {view.bars.length >= 2 ? <MarketPriceChart bars={view.bars} locale={locale} name={fund.name} count={Math.min(view.bars.length, 260)} /> : <p className={s.chartEmpty}>{m.noBars}</p>}
    </RecordCard>
    <RecordCard id="etf-vendor-facts" title={m.vendorData} lede={m.vendorLede}>
      {!st ? <p>{m.noStats}</p> : <dl className={s.facts}>
        <div><dt>{m.vendorSymbol}</dt><dd>{st.vendorSymbol}</dd></div>
        <div><dt>{m.asOf}</dt><dd>{dated(locale, st.asOf)}</dd></div>
        <div><dt>{m.origin}</dt><dd>{st.origin === "enrich" ? m.originEnrich : m.originJob}</dd></div>
        <div><dt>{e.ter}</dt><dd>{pct(locale, fund.terPct)}</dd></div>
        <div><dt>{m.ongoingCharge}</dt><dd>{pct(locale, st.ongoingChargePct, 4)}</dd></div>
        <div><dt>{m.expenseRatio}</dt><dd>{pct(locale, st.netExpenseRatioPct, 4)}</dd></div>
        <div><dt>{m.totalAssets}</dt><dd>{assets === null ? m.noData : `${formatNumber(locale, assets / 1_000_000, 0)} m${st.totalAssetsCurrency ? ` ${st.totalAssetsCurrency}` : ""}`}{assets !== null && !st.totalAssetsCurrency ? <><br /><small>{m.totalAssetsNote}</small></> : null}</dd></div>
        <div><dt>{m.yield}</dt><dd>{pct(locale, st.yieldPct)}</dd></div>
        <div><dt>{m.dividendFrequency}</dt><dd>{textOr(locale, st.dividendFrequency)}</dd></div>
        <div><dt>{m.inception}</dt><dd>{dated(locale, st.inceptionDate)}</dd></div>
        <div><dt>{m.holdingsCount}</dt><dd>{plain(locale, st.holdingsCount, 0)}</dd></div>
        <div><dt>{m.holdingsListed}</dt><dd>{plain(locale, st.holdingsListed, 0)}</dd></div>
        <div><dt>{e.currency}</dt><dd>{textOr(locale, view.currency ?? st.tradingCurrency)}</dd></div>
      </dl>}
    </RecordCard>
  </div>;
}

export function HoldingsPanel({ locale, view }: { locale: Locale; view: EtfDetailView }) {
  const m = getEtfDetailMessages(locale);
  const listed = view.stats?.holdingsListed ?? view.holdings.length;
  return <RecordCard id="etf-holdings" title={m.holdings}>
    {listed > 0 && listed <= 10 ? <p className={s.note}>{fill(m.topOnly, { listed: formatNumber(locale, listed, 0) })}</p> : null}
    {listed > view.holdings.length && view.holdings.length > 0 ? <p className={s.note}>{fill(m.capped, { shown: formatNumber(locale, view.holdings.length, 0), listed: formatNumber(locale, listed, 0) })}</p> : null}
    <DataTable label={m.holdings} density="compact">
      <thead><tr><th scope="col" className="num">{m.position}</th><th scope="col">{m.holding}</th><th scope="col" className="num">{m.weight}</th><th scope="col">{m.sector}</th><th scope="col">{m.country}</th></tr></thead>
      <tbody>{view.holdings.length ? view.holdings.map((row) => <tr key={row.position}>
        <td className="num">{row.position}</td>
        <th scope="row">{row.name ?? row.symbol ?? m.noData}{row.symbol ? <small> {row.symbol}{row.exchange ? `.${row.exchange}` : ""}</small> : null}</th>
        <td className="num">{pct(locale, row.weightPct)}</td><td>{textOr(locale, row.sector)}</td><td>{textOr(locale, row.country)}</td>
      </tr>) : <DataTableEmpty colSpan={5}>{m.noHoldings}</DataTableEmpty>}</tbody>
    </DataTable>
  </RecordCard>;
}

const EXPOSURE_TITLES: Record<ExposureKind, "region" | "sectors" | "mcap" | "asset" | "credit"> = { region: "region", sector: "sectors", mcap: "mcap", asset: "asset", credit: "credit" };
export function ExposurePanel({ locale, view }: { locale: Locale; view: EtfDetailView }) {
  const m = getEtfDetailMessages(locale);
  const kinds = (Object.keys(EXPOSURE_TITLES) as ExposureKind[]).filter((kind) => kind !== "credit" || view.exposure.credit.length);
  return <div className={s.stack}>
    <p className={s.note}>{m.exposureNote}</p>
    <div className={s.exposureGrid}>{kinds.map((kind) => {
      const rows = view.exposure[kind];
      const max = Math.max(1, ...rows.map((row) => Math.abs(row.weightPct)));
      return <RecordCard key={kind} id={`etf-exposure-${kind}`} title={m[EXPOSURE_TITLES[kind]]}>
        <DataTable label={m[EXPOSURE_TITLES[kind]]} density="compact" bounded={false}>
          <thead><tr><th scope="col">{m[EXPOSURE_TITLES[kind]]}</th><th scope="col" className="num">{m.weight}</th></tr></thead>
          <tbody>{rows.length ? rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>
            <td className="num"><span className={s.weightCell}><span className={s.weightBar} style={{ width: `${Math.max(0, row.weightPct) / max * 6}rem` }} aria-hidden="true" />{pct(locale, row.weightPct)}</span></td></tr>)
            : <DataTableEmpty colSpan={2}>{m.noExposure}</DataTableEmpty>}</tbody>
        </DataTable>
      </RecordCard>;
    })}</div>
  </div>;
}

export function PerformancePanel({ locale, view }: { locale: Locale; view: EtfDetailView }) {
  const m = getEtfDetailMessages(locale);
  const st = view.stats;
  const returns: [string, number | null][] = [[m.ytd, st?.retYtdPct ?? null], [m.y1, st?.ret1yPct ?? null], [m.y3, st?.ret3yPct ?? null], [m.y5, st?.ret5yPct ?? null], [m.y10, st?.ret10yPct ?? null]];
  return <div className={s.stack}>
    <p className={s.note}>{m.performanceNote}{st ? ` ${m.asOf}: ${dated(locale, st.asOf)}.` : ""}</p>
    <RecordCard id="etf-returns" title={m.returns}>
      <DataTable label={m.returns} bounded={false}><thead><tr><th scope="col">{m.period}</th><th scope="col" className="num">{m.returns}</th></tr></thead>
        <tbody>{returns.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td className="num">{signed(locale, value)}</td></tr>)}</tbody></DataTable>
    </RecordCard>
    <RecordCard id="etf-risk" title={m.risk}>
      <dl className={s.facts}>
        <div><dt>{m.vol1y}</dt><dd>{pct(locale, st?.vol1yPct ?? null)}</dd></div>
        <div><dt>{m.vol3y}</dt><dd>{pct(locale, st?.vol3yPct ?? null)}</dd></div>
        <div><dt>{m.sharpe3y}</dt><dd>{plain(locale, st?.sharpe3y ?? null)}</dd></div>
      </dl>
    </RecordCard>
  </div>;
}

export function DividendsPanel({ locale, view }: { locale: Locale; view: EtfDetailView }) {
  const m = getEtfDetailMessages(locale);
  return <RecordCard id="etf-dividends" title={m.dividends} meta={view.stats?.dividendFrequency ?? undefined}>
    <DataTable label={m.dividends} density="compact">
      <thead><tr><th scope="col">{m.exDate}</th><th scope="col" className="num">{m.amount}</th><th scope="col">{m.payDate}</th><th scope="col">{m.frequency}</th></tr></thead>
      <tbody>{view.dividends.length ? view.dividends.map((row) => <tr key={row.exDate}>
        <th scope="row">{dated(locale, row.exDate)}</th><td className="num">{row.amount === null ? m.noData : `${formatNumber(locale, row.amount, 4)}${row.currency ? ` ${row.currency}` : ""}`}</td>
        <td>{dated(locale, row.payDate)}</td><td>{textOr(locale, row.period)}</td>
      </tr>) : <DataTableEmpty colSpan={4}>{m.noDividends}</DataTableEmpty>}</tbody>
    </DataTable>
  </RecordCard>;
}
