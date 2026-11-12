import { cache } from "react";
import type pg from "pg";
import { getPool } from "@/db/pool";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";
import { sectorConcentration, type SectorConcentration } from "@/engine/shortlist";
import type { ShortlistData } from "@/data/shortlist";
import { sampleEtfCatalog } from "@/data/etf-fixtures";
import { CACHE_TAGS, webCached } from "@/data/web-cache";

export interface DashboardStock { ticker: string; name: string; sector: string; scorePercent: number; asOf: string }
export interface DashboardFund { key: string; name: string; symbol: string | null; vendorSymbol?: string | null; assetClass: string; region: string | null; trackedIndex: string | null; scorePercent: number; terPercent: number | null; aumUsdM: number | null; asOf: string }
export interface DashboardIndex { code: string; name: string; asOf: string; dates?: string[]; closes?: number[]; aboveMa200: boolean | null; return1y: number | null; volatility1y: number | null }
export interface CrossMarketDashboard { stocks: DashboardStock[]; concentration: SectorConcentration; core: DashboardFund[]; defensive: DashboardFund[]; indices: DashboardIndex[]; sample: boolean }

type Query = Pick<pg.Pool, "query">;
type FundRow = { listing_key: string; name: string; mnemonic: string | null; vendor_symbol: string | null; asset_class: string; region: string | null; tracked_index: string | null; ter_pct: string | number | null; aum_usd_m: string | number | null; as_of: string; earned: number; evidenced_max: number };
type IndexRow = { vendor_symbol: string; name: string; dates: string[] | null; closes: (string | number)[] | null };
const number = (value: string | number | null): number | null => value === null || !Number.isFinite(Number(value)) ? null : Number(value);
const date = (value: string | Date): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

// The latest result for this rules version controls eligibility. An older rated row cannot replace a newer unrated one.
export const BROAD_REGIONS = ["global", "world", "all world", "all-world", "worldwide", "global ex united states", "international", "developed markets", "developed markets ex united states", "developed markets excluding united states", "developed markets excluding united states and canada", "global developed markets", "north america", "united states", "united states and canada", "us", "usa"] as const;
const broadRegion = (region: string | null) => BROAD_REGIONS.includes((region ?? "").trim().toLowerCase() as typeof BROAD_REGIONS[number]);
const BROAD_REGIONS_SQL = BROAD_REGIONS.map((region) => `'${region}'`).join(",");
// Each sleeve has its own bounded selection. The overall list supplies period highlights;
// core and defensive candidates survive even when another class fills that list.
export const FUNDS_SQL = `WITH rated AS MATERIALIZED (
  SELECT c.listing_key,c.name,c.mnemonic,t.vendor_symbol,c.asset_class,c.region,c.tracked_index,c.ter_pct,c.aum_usd_m,
    s.as_of::text AS as_of,s.earned,s.evidenced_max,
    round(s.earned::numeric / s.evidenced_max * 100) AS score_percent
  FROM etf_catalog c JOIN etf_tracked t ON t.listing_key=c.listing_key AND t.active
  JOIN LATERAL (SELECT as_of,earned,evidenced_max,state FROM etf_scores
    WHERE listing_key=c.listing_key AND rules_version=$1 ORDER BY as_of DESC LIMIT 1) s ON true
  WHERE c.instrument_type IN ('ETF','ACTIVE_ETF') AND s.state='rated' AND s.evidenced_max>0
), overall AS (
  SELECT * FROM rated ORDER BY score_percent DESC,earned DESC,listing_key LIMIT 100
), core AS (
  SELECT * FROM (SELECT DISTINCT ON (lower(trim(tracked_index))) * FROM rated
    WHERE asset_class='equity' AND lower(trim(region)) IN (${BROAD_REGIONS_SQL})
      AND tracked_index IS NOT NULL AND trim(tracked_index)<>'' AND ter_pct IS NOT NULL AND ter_pct<=0.2
    ORDER BY lower(trim(tracked_index)),score_percent DESC,earned DESC,listing_key) x
  ORDER BY score_percent DESC,earned DESC,listing_key LIMIT 25
), defensive AS (
  SELECT * FROM rated WHERE asset_class IN ('bond','multi_asset')
  ORDER BY score_percent DESC,earned DESC,listing_key LIMIT 25
)
SELECT DISTINCT ON (listing_key) listing_key,name,mnemonic,vendor_symbol,asset_class,region,tracked_index,ter_pct,aum_usd_m,as_of,earned,evidenced_max
FROM (SELECT * FROM overall UNION ALL SELECT * FROM core UNION ALL SELECT * FROM defensive) candidates
ORDER BY listing_key`;
// One bounded read gets up to 300 recent closes for each tracked index.
const INDICES_SQL = `SELECT a.vendor_symbol,a.name,b.dates,b.closes FROM tracked_assets a
  LEFT JOIN LATERAL (SELECT array_agg(x.bar_date::text ORDER BY x.bar_date) AS dates,
    array_agg(x.close ORDER BY x.bar_date) AS closes FROM
    (SELECT bar_date,close FROM asset_bars WHERE vendor_symbol=a.vendor_symbol ORDER BY bar_date DESC LIMIT 300) x) b ON true
  WHERE a.enabled AND a.asset_class='index' AND a.vendor_symbol !~* '^(VIX|VXN|VVIX|MOVE)([.]|$)' AND a.name !~* '(volatility|fear index)' ORDER BY a.sort,a.vendor_symbol LIMIT 25`;

export function indexMetrics(closesInput: readonly (string | number)[]): Pick<DashboardIndex, "aboveMa200" | "return1y" | "volatility1y"> {
  const closes = closesInput.map(Number);
  if (!closes.length || closes.some((value) => !Number.isFinite(value) || value <= 0)) return { aboveMa200: null, return1y: null, volatility1y: null };
  const last = closes.at(-1)!;
  const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((sum, value) => sum + value, 0) / 200 : null;
  const year = closes.length >= 253 ? closes.slice(-253) : null;
  if (!year) return { aboveMa200: ma200 === null ? null : last >= ma200, return1y: null, volatility1y: null };
  const returns = year.slice(1).map((close, index) => Math.log(close / year[index]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return { aboveMa200: ma200 === null ? null : last >= ma200, return1y: (last / year[0] - 1) * 100, volatility1y: Math.sqrt(variance * 252) * 100 };
}

export function selectDashboardStocks(shortlist: ShortlistData | null): { stocks: DashboardStock[]; concentration: SectorConcentration } {
  const counts = new Map<string, number>();
  const selected = (shortlist?.shortlist.kept ?? []).filter((row) => {
    if (row.percent === null || !["F1", "F2"].every((gate) => {
      const checks = row.checks.filter((check) => check.gate === gate);
      return checks.length > 0 && checks.every((check) => check.status !== "fail");
    })) return false;
    if ((counts.get(row.sector) ?? 0) >= 3) return false;
    counts.set(row.sector, (counts.get(row.sector) ?? 0) + 1);
    return true;
  }).slice(0, 15);
  return {
    stocks: selected.map((row) => ({ ticker: row.ticker, name: shortlist?.names[row.ticker] ?? row.ticker, sector: row.sector, scorePercent: row.percent!, asOf: shortlist!.shortlist.asOf })),
    concentration: sectorConcentration(selected),
  };
}

export function selectDashboardFunds(rows: readonly DashboardFund[]): { core: DashboardFund[]; defensive: DashboardFund[] } {
  const sorted = [...rows].sort((a, b) => b.scorePercent - a.scorePercent || a.key.localeCompare(b.key));
  const seen = new Set<string>();
  const core = sorted.filter((fund) => {
    if (fund.assetClass !== "equity" || !broadRegion(fund.region) || !fund.trackedIndex || fund.terPercent === null || fund.terPercent > 0.2) return false;
    const index = fund.trackedIndex.trim().toLowerCase();
    if (seen.has(index)) return false;
    seen.add(index);
    return true;
  }).slice(0, 5);
  const defensive = sorted.filter((fund) => fund.assetClass === "bond" || fund.assetClass === "multi_asset").slice(0, 5);
  return { core, defensive };
}

export function isInvestableIndex(code: string, name: string): boolean {
  return !/^(vix|vxn|vvix|move)(\.|$)/i.test(code) && !/(volatility|fear index)/i.test(name);
}

export function assembleCrossMarket(shortlist: ShortlistData | null, funds: readonly DashboardFund[], indices: readonly DashboardIndex[], sample: boolean): CrossMarketDashboard {
  return { ...selectDashboardStocks(shortlist), ...selectDashboardFunds(funds), indices: indices.filter((index) => isInvestableIndex(index.code, index.name)).slice(0, 8), sample };
}

async function readCrossMarketUncached(): Promise<{ funds: DashboardFund[]; indices: DashboardIndex[]; sample: boolean }> {
  if (process.env.DATA_MODE === "fixture") {
    const fund = (index: number, scorePercent: number): DashboardFund => {
      const item = sampleEtfCatalog[index];
      return { key: item.listingKey, name: item.name, symbol: item.mnemonic, vendorSymbol: item.mnemonic ? `${item.mnemonic}.ETF` : null, assetClass: item.assetClass ?? "other", region: item.region, trackedIndex: item.trackedIndex,
        scorePercent, terPercent: item.terPct, aumUsdM: item.aumUsdM, asOf: "2026-10-20" };
    };
    // Sample values are local illustrations; no vendor or AI research output enters these sleeves.
    const funds = [fund(1, 94), fund(3, 88), fund(4, 91), fund(7, 84)].map((item, index) => index === 0 ? { ...item, region: "United States" } : item);
    const indices = ["Broad US sample index", "Global sample index"].map((name, index) => {
      const closes = Array.from({ length: 400 }, (_, day) => 100 + day * (index ? 0.04 : 0.07) + Math.sin(day / 9));
      const dates = Array.from({ length: 400 }, (_, day) => new Date(Date.UTC(2025, 9, 1 + day)).toISOString().slice(0, 10));
      return { code: `SAMPLE${index + 1}`, name, asOf: dates.at(-1)!, dates, closes, ...indexMetrics(closes) };
    });
    return { funds, indices, sample: true };
  }
  const db: Query | null = getPool();
  if (!db) return { funds: [], indices: [], sample: false };
  const [fundResult, indexResult] = await Promise.all([db.query<FundRow>(FUNDS_SQL, [ETF_RULES_VERSION]), db.query<IndexRow>(INDICES_SQL)]);
  const funds = fundResult.rows.map((row): DashboardFund => ({ key: row.listing_key, name: row.name, symbol: row.mnemonic, vendorSymbol: row.vendor_symbol, assetClass: row.asset_class, region: row.region,
    trackedIndex: row.tracked_index, scorePercent: Math.round(Number(row.earned) / Number(row.evidenced_max) * 100), terPercent: number(row.ter_pct), aumUsdM: number(row.aum_usd_m), asOf: date(row.as_of) }));
  const indices = indexResult.rows.filter((row) => row.dates?.length).map((row): DashboardIndex => ({ code: row.vendor_symbol.replace(/\.INDX$/, ""), name: row.name,
    asOf: date(row.dates!.at(-1)!), dates: row.dates!.map(date), closes: (row.closes ?? []).map(Number), ...indexMetrics(row.closes ?? []) }));
  return { funds, indices, sample: false };
}

export const latestCrossMarketData = cache(webCached(readCrossMarketUncached, "cross-market-dashboard-v1", [CACHE_TAGS.scores], { bypass: () => !getPool() }));

export const DASHBOARD_PERIODS = ["1d", "1m", "3m", "1y"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export function parseDashboardPeriod(value: unknown): DashboardPeriod {
  return typeof value === "string" && DASHBOARD_PERIODS.includes(value as DashboardPeriod) ? value as DashboardPeriod : "1d";
}

export interface PriceSeries { asOf: string | null; dates: string[]; closes: number[] }
export interface DashboardPeriodRow { code: string; name: string; scorePercent: number | null; trend: boolean | null; scoreDate: string | null; priceDate: string | null; returnPercent: number | null; priceStatus: "stale" | "gap" | "insufficient" | null }
export interface DashboardPeriodRows { stocks: DashboardPeriodRow[]; funds: DashboardPeriodRow[]; indices: DashboardPeriodRow[] }
const daysBetween = (start: string, end: string) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
function offsetDate(end: string, period: Exclude<DashboardPeriod, "1d">): string {
  const date = new Date(`${end}T00:00:00Z`);
  const months = period === "1m" ? 1 : period === "3m" ? 3 : 12;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}
export function periodReturn(series: Pick<PriceSeries, "dates" | "closes">, period: DashboardPeriod, today = new Date().toISOString().slice(0, 10)): { value: number | null; status: "stale" | "gap" | "insufficient" | null } {
  const { dates, closes } = series;
  if (dates.length !== closes.length || dates.length < 2) return { value: null, status: "insufficient" };
  const endDate = dates.at(-1)!;
  if (period === "1d" && daysBetween(endDate, today) > 4) return { value: null, status: "stale" };
  const target = period === "1d" ? null : offsetDate(endDate, period);
  const startIndex = target === null ? dates.length - 2 : dates.findLastIndex((day) => day <= target);
  if (startIndex < 0) return { value: null, status: "insufficient" };
  if (target !== null && daysBetween(dates[startIndex], target) > 4) return { value: null, status: "gap" };
  // A missing trading week invalidates the comparison even when both end points exist.
  for (let i = startIndex + 1; i < dates.length; i++) if (daysBetween(dates[i - 1], dates[i]) > 7) return { value: null, status: "gap" };
  const start = closes[startIndex], end = closes.at(-1)!;
  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0
    ? { value: (end / start - 1) * 100, status: null } : { value: null, status: "gap" };
}

type SeriesRow = { symbol: string; dates: string[] | null; closes: (string | number)[] | null };
const STOCK_PRICES_SQL = `SELECT x.symbol,b.dates,b.closes FROM unnest($1::text[]) x(symbol)
  LEFT JOIN LATERAL (SELECT array_agg(v.bar_date::text ORDER BY v.bar_date) AS dates,array_agg(v.close ORDER BY v.bar_date) AS closes
  FROM (SELECT bar_date,close FROM daily_bars WHERE ticker=x.symbol ORDER BY bar_date DESC LIMIT 300) v) b ON true`;
const FUND_PRICES_SQL = `SELECT x.symbol,b.dates,b.closes FROM unnest($1::text[]) x(symbol)
  LEFT JOIN LATERAL (SELECT array_agg(v.bar_date::text ORDER BY v.bar_date) AS dates,array_agg(v.close ORDER BY v.bar_date) AS closes
  FROM (SELECT bar_date,close FROM asset_bars WHERE vendor_symbol=x.symbol ORDER BY bar_date DESC LIMIT 300) v) b ON true`;
function seriesMap(rows: readonly SeriesRow[]): Record<string, PriceSeries> {
  return Object.fromEntries(rows.map((row) => [row.symbol, { asOf: row.dates?.at(-1) ?? null, dates: row.dates ?? [], closes: (row.closes ?? []).map(Number) }]));
}
async function readPeriodPricesUncached(stockTickers: string[], fundSymbols: string[]): Promise<{ stocks: Record<string, PriceSeries>; funds: Record<string, PriceSeries> }> {
  const tickers = stockTickers.slice(0, 15), symbols = fundSymbols.slice(0, 5);
  if (process.env.DATA_MODE === "fixture") {
    const stockRows = await Promise.all(tickers.map(async (ticker) => {
      const bars = await import("@/data/fixtures").then(({ fixtureProvider }) => fixtureProvider.bars(ticker));
      return [ticker, { asOf: bars.at(-1)?.date ?? null, dates: bars.slice(-300).map((bar) => bar.date), closes: bars.slice(-300).map((bar) => bar.close) }] as const;
    }));
    const fundRows = symbols.map((symbol, index) => [symbol, { asOf: "2026-11-04", dates: Array.from({ length: 400 }, (_, day) => new Date(Date.UTC(2025, 9, 1 + day)).toISOString().slice(0, 10)), closes: Array.from({ length: 400 }, (_, day) => 100 + day * (index + 1) * 0.025 + Math.sin(day / 8)) }] as const);
    return { stocks: Object.fromEntries(stockRows), funds: Object.fromEntries(fundRows) };
  }
  const db = getPool();
  if (!db) return { stocks: {}, funds: {} };
  const [stocks, funds] = await Promise.all([db.query<SeriesRow>(STOCK_PRICES_SQL, [tickers]), db.query<SeriesRow>(FUND_PRICES_SQL, [symbols])]);
  return { stocks: seriesMap(stocks.rows), funds: seriesMap(funds.rows) };
}
export const latestPeriodPrices = cache(webCached(readPeriodPricesUncached, "dashboard-period-prices-v1", [CACHE_TAGS.scores], { bypass: () => !getPool() }));

export function assemblePeriodRows(structure: CrossMarketDashboard, allFunds: readonly DashboardFund[], period: DashboardPeriod,
  prices: { stocks: Record<string, PriceSeries>; funds: Record<string, PriceSeries> }): DashboardPeriodRows {
  const stocks = structure.stocks.slice(0, 5).map((stock): DashboardPeriodRow => {
    const series = prices.stocks[stock.ticker];
    const result = series ? periodReturn(series, period) : { value: null, status: "insufficient" as const };
    return { code: stock.ticker, name: stock.name, scorePercent: stock.scorePercent, trend: null, scoreDate: stock.asOf,
      priceDate: series?.asOf ?? null, returnPercent: result.value, priceStatus: result.status };
  });
  const seenIndices = new Set<string>();
  const funds = [...allFunds].sort((a, b) => b.scorePercent - a.scorePercent || a.key.localeCompare(b.key)).filter((fund) => {
    const index = fund.trackedIndex?.trim().toLowerCase();
    if (!index) return true;
    if (seenIndices.has(index)) return false;
    seenIndices.add(index);
    return true;
  }).slice(0, 5).map((fund): DashboardPeriodRow => {
    const series = fund.vendorSymbol ? prices.funds[fund.vendorSymbol] : null;
    const result = series ? periodReturn(series, period) : { value: null, status: "insufficient" as const };
    return { code: fund.key, name: fund.name, scorePercent: fund.scorePercent, trend: null, scoreDate: fund.asOf,
      priceDate: series?.asOf ?? null, returnPercent: result.value, priceStatus: result.status };
  });
  const trendRank = (trend: boolean | null) => trend === true ? 0 : trend === false ? 1 : 2;
  const indices = [...structure.indices].sort((a, b) => trendRank(a.aboveMa200) - trendRank(b.aboveMa200) || a.name.localeCompare(b.name)).slice(0, 5)
    .map((index): DashboardPeriodRow => {
      const result = periodReturn({ dates: index.dates ?? [], closes: index.closes ?? [] }, period);
      return { code: index.code, name: index.name, scorePercent: null, trend: index.aboveMa200, scoreDate: null,
        priceDate: index.asOf, returnPercent: result.value, priceStatus: result.status };
    });
  return { stocks, funds, indices };
}
