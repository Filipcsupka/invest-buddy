import type pg from "pg";
import { getPool } from "./pool";
import { sampleEtfCatalog } from "@/data/etf-fixtures";
import type { EtfAssetClass } from "./etf";

export type InstrumentType = "ETF" | "ACTIVE_ETF" | "ETC" | "ETN";
export type CatalogSort = "name" | "ter_asc" | "ter_desc" | "aum_asc" | "aum_desc";
export interface CatalogFund {
  listingKey: string; isin: string | null; listingRegion: string | null; wkn: string | null; mnemonic: string | null; name: string; instrumentType: InstrumentType;
  exchange: string; tradingCurrency: string | null; ucits: boolean | null; issuer: string | null;
  assetClass: EtfAssetClass | null; region: string | null; theme: string | null; trackedIndex: string | null;
  terPct: number | null; aumUsdM: number | null; domicile: string | null; replication: string | null;
  distribution: "acc" | "dist" | null; sourceUrl: string | null; enrichmentStatus: "pending" | "ok" | "failed" | "eodhd_unmapped" | "eodhd_incomplete";
  enrichedAt: string | null; firstSeen: string; lastSeen: string; shortlist: boolean; pickSymbol: string | null;
}
export interface CatalogFilters {
  search?: string; assetClass?: string; region?: string; listingRegion?: string; exchange?: string; issuer?: string; distribution?: string;
  ucits?: string; instrumentType?: string; shortlist?: string; enriched?: string; sort?: string; page?: string;
}
export interface CatalogOptions {
  assetClasses: string[]; regions: string[]; listingRegions: string[]; exchanges: string[]; issuers: string[];
}
export interface CatalogStats { size: number; enriched: number; shortlist: number; lastSync: string | null }
export interface CatalogList { funds: CatalogFund[]; total: number; page: number; pages: number; stats: CatalogStats; options: CatalogOptions; sample: boolean }
export const CATALOG_PAGE_SIZE = 50;
type Query = Pick<pg.Pool, "query">;
type Row = {
  listing_key: string; isin: string | null; listing_region: string | null; wkn: string | null; mnemonic: string | null; name: string; instrument_type: InstrumentType;
  exchange: string; trading_currency: string | null; ucits: boolean | null; issuer: string | null;
  asset_class: EtfAssetClass | null; region: string | null; theme: string | null; tracked_index: string | null;
  ter_pct: string | number | null; aum_usd_m: string | number | null; domicile: string | null; replication: string | null;
  distribution: "acc" | "dist" | null; source_url: string | null; enrichment_status: CatalogFund["enrichmentStatus"];
  enriched_at: string | Date | null; first_seen: string | Date; last_seen: string | Date; shortlist: boolean; pick_symbol: string | null;
};
const date = (value: string | Date | null): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
export function mapCatalogFund(row: Row): CatalogFund {
  return {
    listingKey: row.listing_key, isin: row.isin, listingRegion: row.listing_region, wkn: row.wkn, mnemonic: row.mnemonic, name: row.name, instrumentType: row.instrument_type,
    exchange: row.exchange, tradingCurrency: row.trading_currency, ucits: row.ucits, issuer: row.issuer,
    assetClass: row.asset_class, region: row.region, theme: row.theme, trackedIndex: row.tracked_index,
    terPct: row.ter_pct == null ? null : Number(row.ter_pct), aumUsdM: row.aum_usd_m == null ? null : Number(row.aum_usd_m),
    domicile: row.domicile, replication: row.replication, distribution: row.distribution, sourceUrl: row.source_url,
    enrichmentStatus: row.enrichment_status, enrichedAt: date(row.enriched_at), firstSeen: date(row.first_seen) ?? "",
    lastSeen: date(row.last_seen) ?? "", shortlist: row.shortlist, pickSymbol: row.pick_symbol,
  };
}
const COUNT_SQL = `SELECT count(*)::text AS total FROM etf_catalog c WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%' OR c.isin ILIKE '%' || $1 || '%' OR c.mnemonic ILIKE '%' || $1 || '%')
  AND ($2::text IS NULL OR c.asset_class=$2)
  AND ($3::text IS NULL OR c.region=$3)
  AND ($4::text IS NULL OR c.issuer=$4)
  AND ($5::text IS NULL OR c.distribution=$5)
  AND ($6::boolean IS NULL OR c.ucits=$6)
  AND ($7::text IS NULL OR $7='all' OR c.instrument_type=$7)
  AND ($8::boolean IS NULL OR c.shortlist=$8)
  AND ($9::boolean IS NULL OR c.enrichment_status='ok')
  AND ($10::text IS NULL OR c.listing_region=$10)
  AND ($11::text IS NULL OR c.exchange=$11)
  AND ($7::text IS NOT NULL OR c.instrument_type IN ('ETF','ACTIVE_ETF'))`;
const LIST_SQL = `SELECT c.listing_key,c.isin,c.listing_region,c.wkn,c.mnemonic,c.name,c.instrument_type,c.exchange,c.trading_currency,c.ucits,c.issuer,c.asset_class,c.region,c.theme,c.tracked_index,c.ter_pct,c.aum_usd_m,c.domicile,c.replication,c.distribution,c.source_url,c.enrichment_status,c.enriched_at,c.first_seen,c.last_seen,c.shortlist,p.symbol AS pick_symbol FROM etf_catalog c LEFT JOIN LATERAL (SELECT symbol FROM etf_picks WHERE (c.isin IS NOT NULL AND isin=c.isin) OR (exchange=c.exchange AND symbol=c.mnemonic) ORDER BY last_seen_at DESC,symbol LIMIT 1) p ON true WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%' OR c.isin ILIKE '%' || $1 || '%' OR c.mnemonic ILIKE '%' || $1 || '%')
  AND ($2::text IS NULL OR c.asset_class=$2)
  AND ($3::text IS NULL OR c.region=$3)
  AND ($4::text IS NULL OR c.issuer=$4)
  AND ($5::text IS NULL OR c.distribution=$5)
  AND ($6::boolean IS NULL OR c.ucits=$6)
  AND ($7::text IS NULL OR $7='all' OR c.instrument_type=$7)
  AND ($8::boolean IS NULL OR c.shortlist=$8)
  AND ($9::boolean IS NULL OR c.enrichment_status='ok')
  AND ($10::text IS NULL OR c.listing_region=$10)
  AND ($11::text IS NULL OR c.exchange=$11)
  AND ($7::text IS NOT NULL OR c.instrument_type IN ('ETF','ACTIVE_ETF'))
    ORDER BY CASE WHEN $12='name' THEN lower(c.name) END ASC,
      CASE WHEN $12='ter_asc' THEN c.ter_pct END ASC NULLS LAST,
      CASE WHEN $12='ter_desc' THEN c.ter_pct END DESC NULLS LAST,
      CASE WHEN $12='aum_asc' THEN c.aum_usd_m END ASC NULLS LAST,
      CASE WHEN $12='aum_desc' THEN c.aum_usd_m END DESC NULLS LAST, c.listing_key
    LIMIT $13 OFFSET $14`;
const DETAIL_SQL = `SELECT c.listing_key,c.isin,c.listing_region,c.wkn,c.mnemonic,c.name,c.instrument_type,c.exchange,c.trading_currency,c.ucits,c.issuer,c.asset_class,c.region,c.theme,c.tracked_index,c.ter_pct,c.aum_usd_m,c.domicile,c.replication,c.distribution,c.source_url,c.enrichment_status,c.enriched_at,c.first_seen,c.last_seen,c.shortlist,p.symbol AS pick_symbol FROM etf_catalog c LEFT JOIN LATERAL (SELECT symbol FROM etf_picks WHERE (c.isin IS NOT NULL AND isin=c.isin) OR (exchange=c.exchange AND symbol=c.mnemonic) ORDER BY last_seen_at DESC,symbol LIMIT 1) p ON true WHERE c.listing_key=$1`;
const allowedTypes = ["ETF", "ACTIVE_ETF", "ETC", "ETN", "all"];
const allowedSorts: CatalogSort[] = ["name", "ter_asc", "ter_desc", "aum_asc", "aum_desc"];
const valid = (value: string | undefined, allowed: readonly string[]) => value && allowed.includes(value) ? value : null;
const flag = (value: string | undefined): boolean | null => value === "yes" ? true : value === "no" ? false : null;
const pageNumber = (value: string | undefined) => Math.max(1, Math.min(100000, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
export function normalizeCatalogFilters(filters: CatalogFilters) {
  return {
    search: filters.search?.trim().slice(0, 100) || null,
    assetClass: valid(filters.assetClass, ["equity", "bond", "commodity", "multi_asset", "other"]),
    region: filters.region?.slice(0, 100) || null, listingRegion: valid(filters.listingRegion, ["EU", "US"]), exchange: filters.exchange?.slice(0, 40) || null, issuer: filters.issuer?.slice(0, 100) || null,
    distribution: valid(filters.distribution, ["acc", "dist"]), ucits: flag(filters.ucits),
    instrumentType: valid(filters.instrumentType, allowedTypes), shortlist: flag(filters.shortlist),
    enriched: filters.enriched === "yes" ? true : null,
    sort: (valid(filters.sort, allowedSorts) ?? "name") as CatalogSort,
    page: pageNumber(filters.page),
  };
}
export async function etfCatalogList(filters: CatalogFilters = {}, db: Query | null = getPool()): Promise<CatalogList> {
  const f = normalizeCatalogFilters(filters);
  if (process.env.DATA_MODE === "fixture") {
    const options = optionsFrom(sampleEtfCatalog);
    const stats = statsFrom(sampleEtfCatalog);
    const filtered = sampleEtfCatalog.filter((c) =>
      (!f.search || [c.name, c.isin, c.mnemonic].some((v) => v?.toLowerCase().includes(f.search!.toLowerCase()))) &&
      (!f.assetClass || c.assetClass === f.assetClass) && (!f.region || c.region === f.region) &&
      (!f.listingRegion || c.listingRegion === f.listingRegion) && (!f.exchange || c.exchange === f.exchange) &&
      (!f.issuer || c.issuer === f.issuer) && (!f.distribution || c.distribution === f.distribution) &&
      (f.ucits === null || c.ucits === f.ucits) && (f.instrumentType === "all" || (f.instrumentType ? c.instrumentType === f.instrumentType : ["ETF", "ACTIVE_ETF"].includes(c.instrumentType))) &&
      (f.shortlist === null || c.shortlist === f.shortlist) && (!f.enriched || c.enrichmentStatus === "ok"));
    const sorted = [...filtered].sort((a, b) => {
      if (f.sort === "name") return a.name.localeCompare(b.name) || a.listingKey.localeCompare(b.listingKey);
      const field = f.sort.startsWith("ter") ? "terPct" : "aumUsdM";
      const direction = f.sort.endsWith("desc") ? -1 : 1;
      return a[field] === null ? 1 : b[field] === null ? -1 : direction * (a[field]! - b[field]!) || a.listingKey.localeCompare(b.listingKey);
    });
    const pages = Math.max(1, Math.ceil(sorted.length / CATALOG_PAGE_SIZE));
    const page = Math.min(f.page, pages);
    return { funds: sorted.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE), total: sorted.length, page, pages, stats, options, sample: true };
  }
  if (!db) return { funds: [], total: 0, page: 1, pages: 1, stats: { size: 0, enriched: 0, shortlist: 0, lastSync: null }, options: { assetClasses: [], regions: [], listingRegions: [], exchanges: [], issuers: [] }, sample: false };
  const values = [f.search, f.assetClass, f.region, f.issuer, f.distribution, f.ucits, f.instrumentType, f.shortlist, f.enriched, f.listingRegion, f.exchange];
  const [countResult, statsResult, optionsResult] = await Promise.all([
    db.query<{ total: string }>(COUNT_SQL, values),
    db.query<{ size: string; enriched: string; shortlist: string; last_sync: string | null }>("SELECT count(*)::text AS size,count(*) FILTER (WHERE enrichment_status='ok')::text AS enriched,count(*) FILTER (WHERE shortlist)::text AS shortlist,max(last_seen)::text AS last_sync FROM etf_catalog"),
    db.query<{ asset_classes: string[]; regions: string[]; listing_regions: string[]; exchanges: string[]; issuers: string[] }>("SELECT ARRAY(SELECT DISTINCT asset_class FROM etf_catalog WHERE asset_class IS NOT NULL ORDER BY asset_class) AS asset_classes, ARRAY(SELECT DISTINCT region FROM etf_catalog WHERE region IS NOT NULL ORDER BY region) AS regions, ARRAY(SELECT DISTINCT listing_region FROM etf_catalog WHERE listing_region IS NOT NULL ORDER BY listing_region) AS listing_regions, ARRAY(SELECT DISTINCT exchange FROM etf_catalog ORDER BY exchange) AS exchanges, ARRAY(SELECT DISTINCT issuer FROM etf_catalog WHERE issuer IS NOT NULL ORDER BY issuer) AS issuers"),
  ]);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const list = await db.query<Row>(LIST_SQL, [...values, f.sort, CATALOG_PAGE_SIZE, (page - 1) * CATALOG_PAGE_SIZE]);
  const statsRow = statsResult.rows[0];
  const optionRow = optionsResult.rows[0];
  return { funds: list.rows.map(mapCatalogFund), total, page, pages,
    stats: { size: Number(statsRow?.size ?? 0), enriched: Number(statsRow?.enriched ?? 0), shortlist: Number(statsRow?.shortlist ?? 0), lastSync: date(statsRow?.last_sync ?? null) },
    options: { assetClasses: optionRow?.asset_classes ?? [], regions: optionRow?.regions ?? [], listingRegions: optionRow?.listing_regions ?? [], exchanges: optionRow?.exchanges ?? [], issuers: optionRow?.issuers ?? [] }, sample: false };
}
export async function etfCatalogDetail(key: string, db: Query | null = getPool()): Promise<{ fund: CatalogFund; sample: boolean } | null> {
  if (process.env.DATA_MODE === "fixture") {
    const fund = sampleEtfCatalog.find((item) => item.listingKey === key);
    return fund ? { fund, sample: true } : null;
  }
  if (!db) return null;
  const result = await db.query<Row>(DETAIL_SQL, [key]);
  return result.rows[0] ? { fund: mapCatalogFund(result.rows[0]), sample: false } : null;
}
function statsFrom(funds: CatalogFund[]): CatalogStats {
  return { size: funds.length, enriched: funds.filter((f) => f.enrichmentStatus === "ok").length,
    shortlist: funds.filter((f) => f.shortlist).length, lastSync: funds.reduce<string | null>((latest, f) => !latest || f.lastSeen > latest ? f.lastSeen : latest, null) };
}
function optionsFrom(funds: CatalogFund[]): CatalogOptions {
  const values = (field: "assetClass" | "region" | "listingRegion" | "exchange" | "issuer") => [...new Set(funds.map((f) => f[field]).filter((v): v is string => Boolean(v)))].sort();
  return { assetClasses: values("assetClass"), regions: values("region"), listingRegions: values("listingRegion"), exchanges: values("exchange"), issuers: values("issuer") };
}
