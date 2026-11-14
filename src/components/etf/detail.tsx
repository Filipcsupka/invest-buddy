import Link from "next/link";
import type { EtfDetailView, ExposureKind } from "@/db/etf-detail";
import type { CatalogFund } from "@/db/etf-catalog";
import { formatDate, formatNumber, type Locale } from "@/i18n";
import { getEtfDetailMessages, getEtfMessages } from "@/i18n/etf-messages";
import { RecordCard } from "@/components/record-parts";
import { DataTable, DataTableEmpty } from "@/components/kit/data-table";
import { MarketPriceChart } from "@/components/market-price-chart";
import { Chart } from "@/components/chart";
import type { FundView } from "@/db/etf-view";
import { getEtfFundMessages } from "@/i18n/etf-fund-messages";
import { ETF_TABS, etfTabHref, type EtfTab } from "./tabs";
import s from "./etf.module.css";
import f from "./fund.module.css";

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
        <tbody>{returns.map(([label, value], index) => <tr key={label}><th scope="row">{label}</th><td className="num">{index >= 2 && (value === null || value === 0) ? "—" : signed(locale, value)}</td></tr>)}</tbody></DataTable>
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

export function DividendsPanel({ locale, view, sourceDate = null }: { locale: Locale; view: EtfDetailView; sourceDate?: string | null }) {
  const m = getEtfDetailMessages(locale);
  return <RecordCard id="etf-dividends" title={m.dividends} meta={stamp(locale, sourceDate)}>
    <DataTable label={m.dividends} density="compact">
      <thead><tr><th scope="col">{m.exDate}</th><th scope="col" className="num">{m.amount}</th><th scope="col">{m.payDate}</th><th scope="col">{m.frequency}</th></tr></thead>
      <tbody>{view.dividends.length ? view.dividends.map((row) => <tr key={row.exDate}>
        <th scope="row">{dated(locale, row.exDate)}</th><td className="num">{row.amount === null ? m.noData : `${formatNumber(locale, row.amount, 4)}${row.currency ? ` ${row.currency}` : ""}`}</td>
        <td>{dated(locale, row.payDate)}</td><td>{textOr(locale, row.period)}</td>
      </tr>) : <DataTableEmpty colSpan={4}>{m.noDividends}</DataTableEmpty>}</tbody>
    </DataTable>
  </RecordCard>;
}

const stamp = (locale: Locale, value: string | null) => {
  const m = getEtfFundMessages(locale);
  return <small className={f.stamp}>{value ? fill(m.latest, { date: formatDate(locale, value) }) : m.noDate}</small>;
};
const moneyPct = (locale: Locale, value: number | null) => value === null ? getEtfFundMessages(locale).none : `${formatNumber(locale, value, 2)} %`;
const valueOr = (locale: Locale, value: string | null) => value?.trim() || getEtfFundMessages(locale).none;

function PriceStrips({ locale, view }: { locale: Locale; view: FundView }) {
  const m = getEtfFundMessages(locale);
  const bars = view.detail.bars.slice(-100);
  if (bars.length < 2) return null;
  const maxVolume = Math.max(1, ...bars.map((b) => b.volume));
  const drawdown = bars.map((bar, i) => { const peak = Math.max(...bars.slice(0, i + 1).map((item) => item.close)); return peak > 0 ? (bar.close / peak - 1) * 100 : 0; });
  const maxDip = Math.max(1, ...drawdown.map((v) => -v));
  return <div className={f.strips}>
    <div><span>{m.volume}</span><div className={f.strip} role="img" aria-label={m.volume}>{bars.map((bar) => <i key={bar.date} title={`${bar.date}: ${formatNumber(locale, bar.volume, 0)}`} style={{ height: `${Math.max(1, bar.volume / maxVolume * 100)}%` }} />)}</div></div>
    <div><span>{m.drawdown}</span><div className={`${f.strip} ${f.drawdown}`} role="img" aria-label={m.drawdown}>{bars.map((bar, i) => <i key={bar.date} title={`${bar.date}: ${moneyPct(locale, drawdown[i])}`} style={{ height: `${Math.max(1, -drawdown[i] / maxDip * 100)}%` }} />)}</div></div>
  </div>;
}
export function FundOverview({ locale, fund, view }: { locale: Locale; fund: CatalogFund; view: FundView }) {
  const m = getEtfFundMessages(locale), d = view.detail;
  const ter = view.terPct;
  return <div className={s.stack}>
    <RecordCard id="fund-price" title={m.price} meta={stamp(locale, view.dates.bars)}>
      {d.bars.length >= 2 ? <><Chart bars={d.bars} locale={locale} count={260} dipZone={false} labels={{ name: fund.name, aria: locale === "sk" ? `${fund.name}: história ceny` : `${fund.name}: price history`, close: m.price, ma50: m.ma50, ma200: m.ma200, dip: "", last: "{value}" }} /><PriceStrips locale={locale} view={view} /><p className={f.note}>{m.chartNote}</p></> : <p>{m.insufficient}</p>}
    </RecordCard>
    <RecordCard id="fund-cost" title={m.cost} meta={stamp(locale, view.dates.stats ?? view.dates.catalog)}><dl className={f.facts}>
      <div><dt>{m.ter}</dt><dd>{moneyPct(locale, ter)}</dd></div><div><dt>{m.categoryMedian}</dt><dd>{moneyPct(locale, view.categoryMedianTer)}</dd></div><div><dt>{m.category}</dt><dd>{valueOr(locale, view.category)}</dd></div>
    </dl>{view.categoryMedianTer === null ? <p className={f.note}>{m.categoryUnavailable}</p> : null}</RecordCard>
    {fund.assetClass === "bond" || fund.assetClass === "money_market" ? <RecordCard id="fund-bond" title={m.bond} meta={stamp(locale, view.dates.stats)}><dl className={f.facts}>
      <div><dt>{m.duration}</dt><dd>{view.duration === null ? m.none : formatNumber(locale, view.duration, 2)}</dd></div><div><dt>{m.ytm}</dt><dd>{moneyPct(locale, view.ytm)}</dd></div><div><dt>{m.coupon}</dt><dd>{moneyPct(locale, view.coupon)}</dd></div>
    </dl></RecordCard> : null}
    <RecordCard id="fund-structure" title={m.structure} meta={stamp(locale, view.dates.catalog)}><dl className={f.facts}>
      <div><dt>{m.domicile}</dt><dd>{valueOr(locale, fund.domicile)}</dd></div><div><dt>{m.ucitsHint}</dt><dd>{view.ucitsHint === null ? m.none : view.ucitsHint ? locale === "sk" ? "Áno" : "Yes" : locale === "sk" ? "Nie" : "No"}</dd></div>
      <div><dt>{m.replication}</dt><dd>{valueOr(locale, fund.replication)}</dd></div><div><dt>{m.index}</dt><dd>{valueOr(locale, view.indexName)}</dd></div><div><dt>{m.issuer}</dt><dd>{valueOr(locale, fund.issuer)}</dd></div>
    </dl></RecordCard>
    <RecordCard id="fund-alternatives" title={m.alternatives} meta={stamp(locale, view.dates.catalog)}>{view.alternatives.length ? <div className={f.tableScroll}><table className={f.ruleTable}><thead><tr><th scope="col">{m.fund}</th><th scope="col" className="num">{m.ter}</th><th scope="col" className="num">{m.aum}</th></tr></thead><tbody>{view.alternatives.map((a) => <tr key={a.listingKey}><th scope="row"><Link href={`/${locale}/etf/fund/${encodeURIComponent(a.listingKey)}`}>{a.name}</Link></th><td className="num">{moneyPct(locale, a.terPct)}</td><td className="num">{a.aumUsdM === null ? m.none : formatNumber(locale, a.aumUsdM, 0)}</td></tr>)}</tbody></table></div> : <p>{m.noAlternatives}</p>}</RecordCard>
  </div>;
}
function WeightBars({ locale, title, rows, date }: { locale: Locale; title: string; rows: { label: string; weightPct: number }[]; date: string | null }) {
  const m = getEtfFundMessages(locale);
  return <RecordCard id={`fund-${title.replaceAll(" ", "-")}`} title={title} meta={stamp(locale, date)}>{rows.length ? <ul className={f.barList}>{rows.slice(0, 10).map((row) => <li key={row.label}><span>{row.label}</span><div className={f.barTrack}><i style={{ width: `${Math.max(0, Math.min(100, row.weightPct))}%` }} /></div><b>{moneyPct(locale, row.weightPct)}</b></li>)}</ul> : <p>{m.insufficient}</p>}</RecordCard>;
}
export function FundHoldings({ locale, view }: { locale: Locale; view: FundView }) {
  const m = getEtfFundMessages(locale);
  const top = view.detail.holdings.slice(0, 10);
  const sum = top.length === 10 && top.every((h) => h.weightPct !== null) ? top.reduce((acc, h) => acc + h.weightPct!, 0) : null;
  return <div className={s.stack}>
    <RecordCard id="fund-top-holdings" title={m.holdings} meta={stamp(locale, view.dates.holdings)}><p className={f.note}>{m.topOnly}</p><dl className={f.facts}><div><dt>{m.concentration}</dt><dd>{moneyPct(locale, sum)}</dd></div></dl>
      <div className={f.tableScroll}><table className={f.ruleTable}><thead><tr><th scope="col">{m.holdings}</th><th scope="col" className="num">{getEtfDetailMessages(locale).weight}</th><th scope="col">{m.sector}</th><th scope="col">{m.region}</th></tr></thead><tbody>{top.map((h) => <tr key={h.position}><th scope="row">{h.name ?? h.symbol ?? m.none}</th><td className="num">{moneyPct(locale, h.weightPct)}</td><td>{valueOr(locale, h.sector)}</td><td>{valueOr(locale, h.country)}</td></tr>)}</tbody></table></div>
    </RecordCard>
    <div className={f.grid}><WeightBars locale={locale} title={m.sector} rows={view.detail.exposure.sector} date={view.dates.exposure} /><WeightBars locale={locale} title={m.region} rows={view.detail.exposure.region} date={view.dates.exposure} /><WeightBars locale={locale} title={m.marketCap} rows={view.detail.exposure.mcap} date={view.dates.exposure} /></div>
  </div>;
}
export function FundExposure({ locale, view }: { locale: Locale; view: FundView }) {
  const m = getEtfFundMessages(locale), d = getEtfDetailMessages(locale);
  return <div className={f.grid}>
    <WeightBars locale={locale} title={m.sector} rows={view.detail.exposure.sector} date={view.dates.exposure} />
    <WeightBars locale={locale} title={m.region} rows={view.detail.exposure.region} date={view.dates.exposure} />
    <WeightBars locale={locale} title={m.marketCap} rows={view.detail.exposure.mcap} date={view.dates.exposure} />
    <WeightBars locale={locale} title={d.asset} rows={view.detail.exposure.asset} date={view.dates.exposure} />
    <WeightBars locale={locale} title={d.credit} rows={view.detail.exposure.credit} date={view.dates.exposure} />
  </div>;
}
export function FundPerformance({ locale, view }: { locale: Locale; view: FundView }) {
  const m = getEtfFundMessages(locale), st = view.detail.stats;
  return <div className={s.stack}>
    <RecordCard id="fund-performance" title={m.performance} meta={stamp(locale, view.dates.stats)}><p className={f.note}>{m.benchmarkNote}</p>{!view.benchmarkSymbol ? <p>{m.benchmarkUnavailable}</p> : <p className={f.note}>{m.proxy}: {view.benchmarkSymbol}</p>}
      <div className={f.tableScroll}><table className={f.ruleTable}><thead><tr><th scope="col">{getEtfDetailMessages(locale).period}</th><th scope="col" className="num">{m.fund}</th><th scope="col" className="num">{m.proxy}</th></tr></thead><tbody>{view.returns.map((r) => <tr key={r.period}><th scope="row">{r.period}</th><td className="num">{moneyPct(locale, r.fund)}</td><td className="num">{moneyPct(locale, r.benchmark)}</td></tr>)}</tbody></table></div>
    </RecordCard>
    <RecordCard id="fund-risk" title={m.risk} meta={<>{stamp(locale, view.dates.stats)} · {stamp(locale, view.dates.bars)}</>}><dl className={f.facts}>
      <div><dt>{m.volatility}</dt><dd>{moneyPct(locale, st?.vol1yPct ?? null)}</dd></div><div><dt>{m.sharpe}</dt><dd>{st?.sharpe3y == null ? m.none : formatNumber(locale, st.sharpe3y, 2)}</dd></div><div><dt>{m.maxDrawdown}</dt><dd>{moneyPct(locale, view.maxDrawdown3y)}</dd></div>
    </dl></RecordCard>
  </div>;
}
export function FundDividends({ locale, view }: { locale: Locale; view: FundView }) {
  const m = getEtfFundMessages(locale);
  return <div className={s.stack}><RecordCard id="fund-dividend-summary" title={m.dividends} meta={stamp(locale, view.dates.dividends)}><dl className={f.facts}>
    <div><dt>{m.trailingYield}</dt><dd>{moneyPct(locale, view.trailingYieldPct)}</dd></div><div><dt>{m.payments}</dt><dd>{view.paymentsLast12m === null ? m.none : formatNumber(locale, view.paymentsLast12m, 0)}</dd></div>
  </dl></RecordCard><DividendsPanel locale={locale} view={view.detail} sourceDate={view.dates.dividends} /></div>;
}
