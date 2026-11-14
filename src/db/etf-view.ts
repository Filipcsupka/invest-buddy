import type pg from "pg";
import { getPool } from "./pool";
import { etfDetailView, type EtfDetailView } from "./etf-detail";
import { benchmarkSymbol } from "./etf-score";
import type { CatalogFund } from "./etf-catalog";

type Query = Pick<pg.Pool, "query">;
type Row = Record<string, unknown>;
const number = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const date = (value: unknown): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export interface FundReturn { period: "1y" | "3y" | "5y"; fund: number | null; benchmark: number | null }
export interface FundView {
  detail: EtfDetailView;
  dates: { stats: string | null; holdings: string | null; exposure: string | null; bars: string | null; dividends: string | null; catalog: string | null };
  category: string | null; indexName: string | null; ucitsHint: boolean | null;
  terPct: number | null;
  duration: number | null; ytm: number | null; coupon: number | null;
  categoryMedianTer: number | null; benchmarkSymbol: string | null;
  returns: FundReturn[]; maxDrawdown3y: number | null; trailingYieldPct: number | null; paymentsLast12m: number | null;
  alternatives: { listingKey: string; name: string; terPct: number | null; aumUsdM: number | null }[];
}

export function periodReturn(closes: readonly number[], days: number): number | null {
  if (closes.length < days + 1 || closes.at(-days - 1)! <= 0 || closes.at(-1)! <= 0) return null;
  const ratio = closes.at(-1)! / closes.at(-days - 1)!;
  return (days > 252 ? ratio ** (252 / days) : ratio) * 100 - 100;
}
export function maxDrawdown(closes: readonly number[]): number | null {
  if (closes.length < 2) return null;
  let peak = 0, worst = 0;
  for (const close of closes) { if (close <= 0) continue; peak = Math.max(peak, close); worst = Math.min(worst, (close / peak - 1) * 100); }
  return worst;
}
export function trailingDividends(rows: EtfDetailView["dividends"], asOf: string, close: number | null, currency: string | null, fetched: boolean) {
  if (!fetched) return { count: null, yieldPct: null };
  const recent = rows.filter((d) => Date.parse(d.exDate) <= Date.parse(asOf) && Date.parse(d.exDate) > Date.parse(asOf) - 365 * 86_400_000);
  const valid = recent.length > 0 && close !== null && close > 0 && !!currency && recent.every((d) => d.amount !== null && d.amount >= 0 && d.currency === currency);
  return { count: recent.length, yieldPct: valid ? recent.reduce((sum, d) => sum + d.amount!, 0) / close! * 100 : null };
}
const empty = (detail: EtfDetailView, fund: CatalogFund): FundView => ({ detail,
  dates: { stats: detail.stats?.asOf ?? null, holdings: null, exposure: null, bars: detail.bars.at(-1)?.date ?? null, dividends: detail.dividends[0]?.exDate ?? null, catalog: fund.lastSeen },
  category: null, indexName: fund.trackedIndex, ucitsHint: fund.ucits, terPct: fund.terPct, duration: null, ytm: null, coupon: null,
  categoryMedianTer: null, benchmarkSymbol: null, returns: ["1y", "3y", "5y"].map((period) => ({ period, fund: null, benchmark: null })) as FundReturn[], maxDrawdown3y: null, trailingYieldPct: null, paymentsLast12m: null, alternatives: [] });

/** Read-only view for the licensed detail tabs. Each query stays within one listing, category, or index. */
export async function readEtfFundView(fund: CatalogFund, db: Query | null = getPool()): Promise<FundView> {
  const detail = await etfDetailView(fund.listingKey, { holdingsLimit: 500, barDays: 1300 }, db);
  const view = empty(detail, fund);
  if (!db) return view;
  const [stats, dates] = await Promise.all([
    db.query<Row>(`SELECT s.category,s.index_name,s.ucits_hint,c.ucits_hint AS catalog_ucits_hint,s.effective_duration,s.modified_duration,
      s.yield_to_maturity,s.coupon,s.as_of,s.ongoing_charge_pct,s.net_expense_ratio_pct,s.ter_ambiguous,c.ter_gap
      FROM etf_catalog c LEFT JOIN LATERAL (SELECT * FROM etf_fund_stats WHERE listing_key=c.listing_key ORDER BY as_of DESC LIMIT 1) s ON true
      WHERE c.listing_key=$1`, [fund.listingKey]),
    db.query<Row>(`SELECT (SELECT max(as_of) FROM etf_holdings WHERE listing_key=$1) AS holdings,
      (SELECT max(as_of) FROM etf_exposure WHERE listing_key=$1) AS exposure,
      (SELECT dividends_fetched_at FROM etf_tracked WHERE listing_key=$1 LIMIT 1) AS dividends_fetched_at`, [fund.listingKey]),
  ]);
  const row = stats.rows[0];
  view.category = typeof row?.category === "string" ? row.category : null;
  view.indexName = typeof row?.index_name === "string" && row.index_name.trim() ? row.index_name : fund.trackedIndex;
  view.ucitsHint = typeof row?.ucits_hint === "boolean" ? row.ucits_hint : typeof row?.catalog_ucits_hint === "boolean" ? row.catalog_ucits_hint : fund.ucits;
  view.terPct = row?.ter_ambiguous === true || row?.ter_gap === "ter_ambiguous" ? null : number(row?.ongoing_charge_pct) ?? number(row?.net_expense_ratio_pct) ?? fund.terPct;
  view.duration = number(row?.effective_duration) ?? number(row?.modified_duration);
  view.ytm = number(row?.yield_to_maturity);
  view.coupon = number(row?.coupon);
  view.dates.stats = date(row?.as_of) ?? view.dates.stats;
  view.dates.holdings = date(dates.rows[0]?.holdings);
  view.dates.exposure = date(dates.rows[0]?.exposure);
  view.dates.dividends = date(dates.rows[0]?.dividends_fetched_at);
  const trailing = trailingDividends(detail.dividends, view.dates.bars ?? view.dates.stats ?? fund.lastSeen, detail.bars.at(-1)?.close ?? null, detail.currency, !!view.dates.dividends);
  view.paymentsLast12m = trailing.count;
  view.trailingYieldPct = trailing.yieldPct;
  if (view.category) {
    const median = await db.query<Row>(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN s.ter_ambiguous OR c.ter_gap='ter_ambiguous' THEN NULL ELSE COALESCE(s.ongoing_charge_pct,s.net_expense_ratio_pct,c.ter_pct) END) AS median
      FROM etf_catalog c JOIN LATERAL (SELECT category,ongoing_charge_pct,net_expense_ratio_pct,ter_ambiguous FROM etf_fund_stats
      WHERE listing_key=c.listing_key ORDER BY as_of DESC LIMIT 1) s ON true
      WHERE lower(s.category)=lower($1) AND c.instrument_type='ETF'`, [view.category]);
    view.categoryMedianTer = number(median.rows[0]?.median);
  }
  if (view.indexName) {
    const peers = await db.query<Row>(`SELECT c.listing_key,c.name,CASE WHEN s.ter_ambiguous OR c.ter_gap='ter_ambiguous' THEN NULL ELSE COALESCE(s.ongoing_charge_pct,s.net_expense_ratio_pct,c.ter_pct) END AS ter_pct,c.aum_usd_m
      FROM etf_catalog c LEFT JOIN LATERAL (SELECT index_name,ongoing_charge_pct,net_expense_ratio_pct,ter_ambiguous FROM etf_fund_stats
      WHERE listing_key=c.listing_key ORDER BY as_of DESC LIMIT 1) s ON true
      WHERE c.listing_key<>$1 AND c.instrument_type='ETF' AND lower(COALESCE(s.index_name,c.tracked_index,''))=lower($2)
      ORDER BY ter_pct ASC NULLS LAST,c.name LIMIT 5`, [fund.listingKey, view.indexName]);
    view.alternatives = peers.rows.map((p) => ({ listingKey: String(p.listing_key), name: String(p.name), terPct: number(p.ter_pct), aumUsdM: number(p.aum_usd_m) }));
  }
  const benchmark = fund.assetClass === "equity" ? benchmarkSymbol({ region: fund.region, category: view.category }) : null;
  view.benchmarkSymbol = benchmark;
  let benchmarkCloses: number[] = [];
  if (benchmark) {
    const bars = await db.query<Row>(`SELECT bar_date,close FROM (SELECT bar_date,close FROM asset_bars WHERE vendor_symbol=$1 AND bar_date<=$2::date ORDER BY bar_date DESC LIMIT 1261) b ORDER BY bar_date`, [benchmark, view.dates.bars ?? view.dates.stats ?? fund.lastSeen]);
    const lastDate = date(bars.rows.at(-1)?.bar_date);
    if (lastDate && view.dates.bars && Math.abs(Date.parse(lastDate) - Date.parse(view.dates.bars)) <= 7 * 86_400_000) benchmarkCloses = bars.rows.map((b) => number(b.close) ?? 0);
  }
  const closes = detail.bars.map((b) => b.close);
  view.maxDrawdown3y = closes.length >= 756 ? maxDrawdown(closes.slice(-756)) : null;
  view.returns = ([ ["1y", 252], ["3y", 756], ["5y", 1260] ] as const).map(([period, days]) => {
    const ownPriceReturn = periodReturn(closes, days);
    const proxyPriceReturn = periodReturn(benchmarkCloses, days);
    const reported = period === "1y" ? detail.stats?.ret1yPct : period === "3y" ? detail.stats?.ret3yPct : detail.stats?.ret5yPct;
    return { period, fund: proxyPriceReturn !== null ? ownPriceReturn : ownPriceReturn ?? reported ?? null, benchmark: ownPriceReturn !== null ? proxyPriceReturn : null };
  });
  return view;
}
