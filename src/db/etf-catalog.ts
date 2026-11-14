import type pg from "pg";
import { getPool } from "./pool";
import { sampleEtfCatalog, sampleEtfScores } from "@/data/etf-fixtures";
import { ETF_ASSET_CLASSES, type EtfAssetClass } from "./etf";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";
import { etfBand, type EtfBand } from "@/engine/etf-bands";
import { etfScoreCoverage, type EtfRuleHit } from "@/engine/etf-score";

export type InstrumentType = "ETF" | "ACTIVE_ETF" | "ETC" | "ETN";
export type CatalogSort = "rating" | "name" | "ter_asc" | "ter_desc" | "aum_asc" | "aum_desc" | "ret1y_desc" | "ret3y_desc";
/** Why AUM in EUR is blank: no figure, a figure without a stated currency, or a USD figure without a current EURUSD rate. */
export type AumGap = "missing" | "currency" | "fx" | null;
/** Stored fund facts for the list. Vendor figures stay null unless the caller passed vendor access. */
export interface CatalogFacts {
  terPct: number | null; aumEurM: number | null; aumGap: AumGap; category: string | null;
  ret1yPct: number | null; ret3yPct: number | null; vol1yPct: number | null; yieldPct: number | null;
  holdingsCount: number | null; topTenWeightPct: number | null; statsAsOf: string | null;
}
export interface CatalogFund {
  listingKey: string; isin: string | null; listingRegion: string | null; wkn: string | null; mnemonic: string | null; name: string; instrumentType: InstrumentType;
  exchange: string; tradingCurrency: string | null; ucits: boolean | null; issuer: string | null;
  assetClass: EtfAssetClass | null; region: string | null; theme: string | null; trackedIndex: string | null;
  terPct: number | null; aumUsdM: number | null; domicile: string | null; replication: string | null;
  distribution: "acc" | "dist" | null; sourceUrl: string | null; enrichmentStatus: "pending" | "ok" | "failed" | "eodhd_unmapped" | "eodhd_incomplete";
  enrichedAt: string | null; firstSeen: string; lastSeen: string; shortlist: boolean; pickSymbol: string | null;
  facts?: CatalogFacts;
}
export interface CatalogFilters {
  search?: string; assetClass?: string; region?: string; listingRegion?: string; exchange?: string; issuer?: string; distribution?: string;
  ucits?: string; instrumentType?: string; shortlist?: string; enriched?: string; sort?: string; page?: string;
  band?: string; category?: string; ter?: string; aum?: string; evidence?: string;
}
export interface CatalogOptions {
  assetClasses: string[]; regions: string[]; listingRegions: string[]; exchanges: string[]; issuers: string[]; categories: string[];
}
export interface CatalogStats { size: number; enriched: number; shortlist: number; lastSync: string | null }
export interface CatalogList { funds: CatalogFund[]; total: number; rated: number; withData: number; page: number; pages: number; stats: CatalogStats; options: CatalogOptions; sample: boolean }
/** Vendor access widens the read: fund statistics, holdings and the category filter. The page passes its own gate result. */
export interface CatalogAccess { vendor?: boolean }
export const CATALOG_PAGE_SIZE = 50;
export const RATING_BANDS: readonly EtfBand[] = ["rulesMet", "mostlyMet", "partlyMet", "fewMet"];
export const BAND_FILTERS = [...RATING_BANDS, "notRated"] as const;
export type BandFilter = (typeof BAND_FILTERS)[number];
/** TER presets in percent: [exclusive lower bound, inclusive upper bound]. */
export const TER_RANGES = { upTo010: [null, 0.10], upTo020: [null, 0.20], upTo030: [null, 0.30], upTo050: [null, 0.50], over050: [0.50, null] } as const;
/** AUM presets in EUR millions: [inclusive lower bound, exclusive upper bound]. */
export const AUM_RANGES = { under100: [null, 100], from100to500: [100, 500], from500to1000: [500, 1000], over1000: [1000, null] } as const;
export type TerRange = keyof typeof TER_RANGES;
export type AumRange = keyof typeof AUM_RANGES;
export const EVIDENCE_FILTERS = ["full", "incomplete"] as const;
/** Evidenced points below this mark the Incomplete data flag (src/engine/etf-bands.ts). */
const FULL_EVIDENCE = 70;
const IN_SCOPE_TYPES = ["ETF", "ACTIVE_ETF"];
type Query = Pick<pg.Pool, "query">;
type Row = {
  listing_key: string; isin: string | null; listing_region: string | null; wkn: string | null; mnemonic: string | null; name: string; instrument_type: InstrumentType;
  exchange: string; trading_currency: string | null; ucits: boolean | null; issuer: string | null;
  asset_class: EtfAssetClass | null; region: string | null; theme: string | null; tracked_index: string | null;
  ter_pct: string | number | null; aum_usd_m: string | number | null; domicile: string | null; replication: string | null;
  distribution: "acc" | "dist" | null; source_url: string | null; enrichment_status: CatalogFund["enrichmentStatus"];
  enriched_at: string | Date | null; first_seen: string | Date; last_seen: string | Date; shortlist: boolean; pick_symbol: string | null;
};
type FactsRow = {
  fact_ter_pct: string | number | null; aum_eur_m: string | number | null; aum_gap: AumGap; category: string | null;
  ret_1y_pct: string | number | null; ret_3y_pct: string | number | null; vol_1y_pct: string | number | null; yield_pct: string | number | null;
  holdings_count: string | number | null; stats_as_of: string | Date | null;
};
const date = (value: string | Date | null): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const num = (value: string | number | null | undefined): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
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
const mapFacts = (row: FactsRow, topTen: number | null): CatalogFacts => ({
  terPct: num(row.fact_ter_pct), aumEurM: num(row.aum_eur_m), aumGap: row.aum_gap, category: row.category,
  ret1yPct: num(row.ret_1y_pct), ret3yPct: num(row.ret_3y_pct), vol1yPct: num(row.vol_1y_pct), yieldPct: num(row.yield_pct),
  holdingsCount: num(row.holdings_count), topTenWeightPct: topTen, statsAsOf: date(row.stats_as_of),
});

// SQL fragments shared by the list, count, summary and top-rated reads. Aliases: c catalog, s score of the latest run, st latest stats, fx EUR per USD.
const CATALOG_COLUMNS = "c.listing_key,c.isin,c.listing_region,c.wkn,c.mnemonic,c.name,c.instrument_type,c.exchange,c.trading_currency,c.ucits,c.issuer,c.asset_class,c.region,c.theme,c.tracked_index,c.ter_pct,c.aum_usd_m,c.domicile,c.replication,c.distribution,c.source_url,c.enrichment_status,c.enriched_at,c.first_seen,c.last_seen,c.shortlist";
/** A EURUSD close older than this does not convert AUM; the cell shows the no-rate gap instead. */
export const FX_MAX_AGE_DAYS = 7;
const FX_CTE = `fx AS (SELECT 1 / NULLIF(close, 0) AS eur_per_usd FROM asset_bars WHERE vendor_symbol='EURUSD.FOREX' AND bar_date >= CURRENT_DATE - ${FX_MAX_AGE_DAYS} ORDER BY bar_date DESC LIMIT 1)`;
/** The latest current-version score run. The strip, the list, its filters and Highest rated all read this one run. */
const latestCte = (version: string) => `latest AS (SELECT max(as_of) AS as_of FROM etf_scores WHERE rules_version=${version})`;
const statsJoin = (vendor: string) => `LEFT JOIN LATERAL (SELECT as_of,total_assets,total_assets_currency,ongoing_charge_pct,net_expense_ratio_pct,category,ret_1y_pct,ret_3y_pct,vol_1y_pct,yield_pct,holdings_count FROM etf_fund_stats WHERE listing_key=c.listing_key ORDER BY as_of DESC LIMIT 1) st ON ${vendor}::boolean`;
const scoreJoin = (version: string) => `LEFT JOIN etf_scores s ON s.listing_key=c.listing_key AND s.rules_version=${version} AND s.as_of=(SELECT as_of FROM latest)`;
const PCT = "round(s.earned::numeric / NULLIF(s.evidenced_max,0) * 100)";
/** Mirrors etfBand(): 72/60/48 percent, and below 70 evidenced points the best band is Mostly met. Only current-version rows get a band. */
const bandSql = (version: string) => `CASE WHEN s.rules_version=${version} AND s.state='rated' AND s.evidenced_max>0 THEN CASE WHEN ${PCT}>=72 AND s.evidenced_max>=${FULL_EVIDENCE} THEN 'rulesMet' WHEN ${PCT}>=60 THEN 'mostlyMet' WHEN ${PCT}>=48 THEN 'partlyMet' ELSE 'fewMet' END END`;
const BAND_RANK = (band: string) => `CASE ${band} WHEN 'rulesMet' THEN 0 WHEN 'mostlyMet' THEN 1 WHEN 'partlyMet' THEN 2 WHEN 'fewMet' THEN 3 ELSE 4 END`;
const TER = "COALESCE(st.ongoing_charge_pct, st.net_expense_ratio_pct, c.ter_pct)";
/** EUR millions only when the currency is known: stated stats currency, or the catalog USD figure of a USD listing on a US venue (as the rating reads it). */
const AUM_EUR = `CASE WHEN st.total_assets IS NOT NULL AND st.total_assets_currency='EUR' THEN st.total_assets / 1e6
  WHEN st.total_assets IS NOT NULL AND st.total_assets_currency='USD' THEN st.total_assets * fx.eur_per_usd / 1e6
  WHEN c.listing_region='US' AND c.trading_currency='USD' AND c.aum_usd_m > 0 THEN c.aum_usd_m * fx.eur_per_usd END`;
const AUM_GAP = `CASE WHEN (${AUM_EUR}) IS NOT NULL THEN NULL
  WHEN (st.total_assets IS NOT NULL AND st.total_assets_currency='USD') OR (c.listing_region='US' AND c.trading_currency='USD' AND c.aum_usd_m > 0) THEN 'fx'
  WHEN st.total_assets IS NOT NULL OR c.aum_usd_m IS NOT NULL THEN 'currency' ELSE 'missing' END`;
const FACT_COLUMNS = `${TER} AS fact_ter_pct,${AUM_EUR} AS aum_eur_m,${AUM_GAP} AS aum_gap,st.category,st.ret_1y_pct,st.ret_3y_pct,st.vol_1y_pct,st.yield_pct,st.holdings_count,st.as_of AS stats_as_of`;
const PICK_JOIN = "LEFT JOIN LATERAL (SELECT symbol FROM etf_picks WHERE (c.isin IS NOT NULL AND isin=c.isin) OR (exchange=c.exchange AND symbol=c.mnemonic) ORDER BY last_seen_at DESC,symbol LIMIT 1) p ON true";
const PAGE_PICKS_SQL = `SELECT c.listing_key,p.symbol AS pick_symbol FROM etf_catalog c ${PICK_JOIN} WHERE c.listing_key=ANY($1::text[])`;
const DETAIL_SQL = `SELECT ${CATALOG_COLUMNS},p.symbol AS pick_symbol FROM etf_catalog c ${PICK_JOIN} WHERE c.listing_key=$1`;
const TOP_TEN_SQL = `SELECT k.listing_key, CASE WHEN count(h.weight_pct)=10 THEN sum(h.weight_pct) END AS top_ten FROM unnest($1::text[]) k(listing_key)
  CROSS JOIN LATERAL (SELECT weight_pct FROM etf_holdings WHERE listing_key=k.listing_key ORDER BY weight_pct DESC NULLS LAST LIMIT 10) h GROUP BY k.listing_key`;

const allowedTypes = ["ETF", "ACTIVE_ETF", "ETC", "ETN", "all"];
const allowedSorts: CatalogSort[] = ["rating", "name", "ter_asc", "ter_desc", "aum_asc", "aum_desc", "ret1y_desc", "ret3y_desc"];
const vendorSorts: CatalogSort[] = ["ret1y_desc", "ret3y_desc"];
const valid = <T extends string>(value: string | undefined, allowed: readonly T[]): T | null => value && (allowed as readonly string[]).includes(value) ? value as T : null;
const flag = (value: string | undefined): boolean | null => value === "yes" ? true : value === "no" ? false : null;
const pageNumber = (value: string | undefined) => Math.max(1, Math.min(100000, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
/** Untrusted query values become bounded filters. Vendor-derived filters and sorts are dropped without vendor access. */
export function normalizeCatalogFilters(filters: CatalogFilters, access: CatalogAccess = {}) {
  const vendor = access.vendor === true;
  const sort = valid(filters.sort, allowedSorts) ?? "rating";
  return {
    search: filters.search?.trim().slice(0, 100) || null,
    assetClass: valid(filters.assetClass, ETF_ASSET_CLASSES),
    region: filters.region?.slice(0, 100) || null, listingRegion: valid(filters.listingRegion, ["EU", "US"]), exchange: filters.exchange?.slice(0, 40) || null, issuer: filters.issuer?.slice(0, 100) || null,
    distribution: valid(filters.distribution, ["acc", "dist"]), ucits: flag(filters.ucits),
    instrumentType: valid(filters.instrumentType, allowedTypes), shortlist: flag(filters.shortlist),
    enriched: filters.enriched === "yes" ? true : null,
    band: valid(filters.band, BAND_FILTERS), evidence: valid(filters.evidence, EVIDENCE_FILTERS),
    ter: valid(filters.ter, Object.keys(TER_RANGES) as TerRange[]), aum: valid(filters.aum, Object.keys(AUM_RANGES) as AumRange[]),
    category: vendor ? filters.category?.trim().slice(0, 200) || null : null,
    sort: (vendor || !vendorSorts.includes(sort) ? sort : "rating") as CatalogSort,
    page: pageNumber(filters.page),
    vendor,
  };
}
type Normalized = ReturnType<typeof normalizeCatalogFilters>;

/** Builds the bound WHERE clause and ORDER BY for the catalog read. Every user value is a parameter. */
export function catalogQuery(f: Normalized) {
  const values: unknown[] = [];
  const p = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const version = p(ETF_RULES_VERSION);
  // A server-side boolean, not user input: written as a literal so a count without the stats join binds no unused parameter.
  const vendor = f.vendor ? "true" : "false";
  const band = bandSql(version);
  const where: string[] = [];
  if (f.search) { const term = p(f.search); where.push(`(c.name ILIKE '%' || ${term} || '%' OR c.isin ILIKE '%' || ${term} || '%' OR c.mnemonic ILIKE '%' || ${term} || '%')`); }
  if (f.assetClass) where.push(`c.asset_class=${p(f.assetClass)}`);
  if (f.region) where.push(`c.region=${p(f.region)}`);
  if (f.issuer) where.push(`c.issuer=${p(f.issuer)}`);
  if (f.distribution) where.push(`c.distribution=${p(f.distribution)}`);
  if (f.ucits !== null) where.push(`c.ucits=${p(f.ucits)}`);
  if (f.instrumentType === null) where.push(`c.instrument_type IN ('ETF','ACTIVE_ETF')`);
  else if (f.instrumentType !== "all") where.push(`c.instrument_type=${p(f.instrumentType)}`);
  if (f.shortlist !== null) where.push(`c.shortlist=${p(f.shortlist)}`);
  if (f.enriched) where.push(`c.enrichment_status='ok'`);
  if (f.listingRegion) where.push(`c.listing_region=${p(f.listingRegion)}`);
  if (f.exchange) where.push(`c.exchange=${p(f.exchange)}`);
  if (f.band === "notRated") where.push(`s.state IS DISTINCT FROM 'rated'`);
  else if (f.band) where.push(`(${band})=${p(f.band)}`);
  if (f.evidence) where.push(`s.rules_version=${version} AND s.state='rated' AND s.evidenced_max ${f.evidence === "full" ? ">=" : "<"} ${FULL_EVIDENCE}`);
  if (f.category) where.push(`st.category=${p(f.category)}`);
  if (f.ter) { const [above, upTo] = TER_RANGES[f.ter]; if (above !== null) where.push(`${TER} > ${p(above)}`); if (upTo !== null) where.push(`${TER} <= ${p(upTo)}`); }
  if (f.aum) { const [from, below] = AUM_RANGES[f.aum]; if (from !== null) where.push(`(${AUM_EUR}) >= ${p(from)}`); if (below !== null) where.push(`(${AUM_EUR}) < ${p(below)}`); }
  const order = {
    rating: `CASE WHEN s.state='rated' THEN 0 WHEN c.enrichment_status='ok' THEN 1 ELSE 2 END, ${BAND_RANK(band)}, CASE WHEN s.state='rated' THEN ${PCT} END DESC NULLS LAST, CASE WHEN s.state='rated' THEN s.evidenced_max END DESC NULLS LAST, CASE WHEN s.state IS DISTINCT FROM 'rated' AND c.enrichment_status='ok' THEN ${AUM_EUR} END DESC NULLS LAST, lower(c.name)`,
    name: "lower(c.name)",
    ter_asc: `${TER} ASC NULLS LAST`, ter_desc: `${TER} DESC NULLS LAST`,
    aum_asc: `(${AUM_EUR}) ASC NULLS LAST`, aum_desc: `(${AUM_EUR}) DESC NULLS LAST`,
    ret1y_desc: "st.ret_1y_pct DESC NULLS LAST", ret3y_desc: "st.ret_3y_pct DESC NULLS LAST",
  }[f.sort];
  // The count reads stats only when a stats filter needs them; the list always does (facts, TER, AUM and return sorts).
  const statsNeeded = Boolean(f.category || f.ter || f.aum);
  const from = ({ stats = true } = {}) => `FROM etf_catalog c ${scoreJoin(version)} ${stats || statsNeeded ? statsJoin(vendor) : ""} LEFT JOIN fx ON true${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  return { values, from, order: `${order}, c.listing_key`, with: `WITH ${FX_CTE}, ${latestCte(version)}`, p };
}

const sortValue = (fund: CatalogFund, sort: CatalogSort): number | null => sort.startsWith("ter") ? fund.facts?.terPct ?? null : sort.startsWith("aum") ? fund.facts?.aumEurM ?? null : sort === "ret1y_desc" ? fund.facts?.ret1yPct ?? null : sort === "ret3y_desc" ? fund.facts?.ret3yPct ?? null : null;
/** Sample facts for fixture mode, derived from the sample catalog so the page shows every column. Labelled SAMPLE DATA on the page. */
export function sampleCatalogFacts(fund: CatalogFund, index: number, vendor: boolean): CatalogFacts {
  const enriched = fund.enrichmentStatus === "ok";
  const aumEurM = fund.aumUsdM === null ? null : Math.round(fund.aumUsdM * 0.92 * 10) / 10;
  const facts: CatalogFacts = { terPct: fund.terPct, aumEurM, aumGap: aumEurM === null ? "missing" : null, category: null, ret1yPct: null, ret3yPct: null, vol1yPct: null, yieldPct: null, holdingsCount: null, topTenWeightPct: null, statsAsOf: null };
  if (!vendor || !enriched) return facts;
  return { ...facts, category: `${fund.region ?? "Global"} ${fund.assetClass === "bond" ? "Bond" : "Equity"}`, ret1yPct: Math.round((((index * 37) % 31) - 8) * 10) / 10,
    ret3yPct: index % 6 === 0 ? null : Math.round((((index * 13) % 17) - 3) * 10) / 10, vol1yPct: 8 + (index % 9) * 1.7, yieldPct: fund.distribution === "dist" ? 1 + (index % 4) * 0.6 : null,
    holdingsCount: 40 + index * 23, topTenWeightPct: index % 5 === 0 ? null : 15 + (index % 7) * 6, statsAsOf: "2026-10-20" };
}
function sampleBand(key: string): EtfBand | null {
  const score = sampleEtfScores.get(key);
  return score?.state === "rated" && score.percent !== null && score.rulesVersion === ETF_RULES_VERSION ? etfBand(score.percent, score.evidencedMax).band : null;
}
const inRange = (value: number | null, [low, high]: readonly [number | null, number | null], lowInclusive: boolean) => value !== null && (low === null || (lowInclusive ? value >= low : value > low)) && (high === null || (lowInclusive ? value < high : value <= high));

function fixtureList(f: Normalized): CatalogList {
  const options = optionsFrom(sampleEtfCatalog);
  const stats = statsFrom(sampleEtfCatalog);
  const withFacts = sampleEtfCatalog.map((fund, index) => ({ ...fund, facts: sampleCatalogFacts(fund, index, f.vendor) }));
  if (f.vendor) options.categories = [...new Set(withFacts.map((fund) => fund.facts.category).filter((v): v is string => Boolean(v)))].sort();
  const filtered = withFacts.filter((c) => {
    const score = sampleEtfScores.get(c.listingKey);
    return (!f.search || [c.name, c.isin, c.mnemonic].some((v) => v?.toLowerCase().includes(f.search!.toLowerCase()))) &&
      (!f.assetClass || c.assetClass === f.assetClass) && (!f.region || c.region === f.region) &&
      (!f.listingRegion || c.listingRegion === f.listingRegion) && (!f.exchange || c.exchange === f.exchange) &&
      (!f.issuer || c.issuer === f.issuer) && (!f.distribution || c.distribution === f.distribution) &&
      (f.ucits === null || c.ucits === f.ucits) && (f.instrumentType === "all" || (f.instrumentType ? c.instrumentType === f.instrumentType : IN_SCOPE_TYPES.includes(c.instrumentType))) &&
      (f.shortlist === null || c.shortlist === f.shortlist) && (!f.enriched || c.enrichmentStatus === "ok") &&
      (!f.band || (f.band === "notRated" ? score?.state !== "rated" : sampleBand(c.listingKey) === f.band)) &&
      (!f.evidence || (score?.state === "rated" && score.rulesVersion === ETF_RULES_VERSION && (f.evidence === "full" ? score.evidencedMax >= FULL_EVIDENCE : score.evidencedMax < FULL_EVIDENCE))) &&
      (!f.category || c.facts.category === f.category) &&
      (!f.ter || inRange(c.facts.terPct, TER_RANGES[f.ter], false)) && (!f.aum || inRange(c.facts.aumEurM, AUM_RANGES[f.aum], true));
  });
  const bandRank = (key: string) => { const band = sampleBand(key); return band ? RATING_BANDS.indexOf(band) : RATING_BANDS.length; };
  const sorted = [...filtered].sort((a, b) => {
    if (f.sort === "rating") {
      const aScore = sampleEtfScores.get(a.listingKey);
      const bScore = sampleEtfScores.get(b.listingKey);
      const tier = (fund: CatalogFund, rated: boolean) => rated ? 0 : fund.enrichmentStatus === "ok" ? 1 : 2;
      const aTier = tier(a, aScore?.state === "rated");
      const bTier = tier(b, bScore?.state === "rated");
      return aTier - bTier || bandRank(a.listingKey) - bandRank(b.listingKey) || (aTier === 0 ? (bScore?.percent ?? 0) - (aScore?.percent ?? 0) || (bScore?.evidencedMax ?? 0) - (aScore?.evidencedMax ?? 0) : 0) ||
        (aTier === 1 ? (b.facts.aumEurM ?? -Infinity) - (a.facts.aumEurM ?? -Infinity) : 0) || a.name.localeCompare(b.name) || a.listingKey.localeCompare(b.listingKey);
    }
    if (f.sort === "name") return a.name.localeCompare(b.name) || a.listingKey.localeCompare(b.listingKey);
    const direction = f.sort.endsWith("desc") ? -1 : 1;
    const av = sortValue(a, f.sort), bv = sortValue(b, f.sort);
    return av === null ? (bv === null ? a.listingKey.localeCompare(b.listingKey) : 1) : bv === null ? -1 : direction * (av - bv) || a.listingKey.localeCompare(b.listingKey);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / CATALOG_PAGE_SIZE));
  const page = Math.min(f.page, pages);
  return { funds: sorted.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE), total: sorted.length,
    rated: filtered.filter((fund) => sampleEtfScores.get(fund.listingKey)?.state === "rated").length,
    withData: filtered.filter((fund) => fund.enrichmentStatus === "ok").length, page, pages, stats, options, sample: true };
}

export async function etfCatalogList(filters: CatalogFilters = {}, db: Query | null = getPool(), access: CatalogAccess = {}): Promise<CatalogList> {
  const f = normalizeCatalogFilters(filters, access);
  if (process.env.DATA_MODE === "fixture") return fixtureList(f);
  if (!db) return { funds: [], total: 0, rated: 0, withData: 0, page: 1, pages: 1, stats: { size: 0, enriched: 0, shortlist: 0, lastSync: null }, options: { assetClasses: [], regions: [], listingRegions: [], exchanges: [], issuers: [], categories: [] }, sample: false };
  const q = catalogQuery(f);
  const [countResult, statsResult, optionsResult] = await Promise.all([
    db.query<{ total: string; rated: string; with_data: string }>(`${q.with} SELECT count(*)::text AS total,count(*) FILTER (WHERE s.state='rated')::text AS rated,count(*) FILTER (WHERE c.enrichment_status='ok')::text AS with_data ${q.from({ stats: false })}`, q.values),
    db.query<{ size: string; enriched: string; shortlist: string; last_sync: string | null }>("SELECT count(*)::text AS size,count(*) FILTER (WHERE enrichment_status='ok')::text AS enriched,count(*) FILTER (WHERE shortlist)::text AS shortlist,max(last_seen)::text AS last_sync FROM etf_catalog"),
    db.query<{ asset_classes: string[]; regions: string[]; listing_regions: string[]; exchanges: string[]; issuers: string[]; categories: string[] | null }>(`SELECT ARRAY(SELECT DISTINCT asset_class FROM etf_catalog WHERE asset_class IS NOT NULL ORDER BY asset_class) AS asset_classes, ARRAY(SELECT DISTINCT region FROM etf_catalog WHERE region IS NOT NULL ORDER BY region) AS regions, ARRAY(SELECT DISTINCT listing_region FROM etf_catalog WHERE listing_region IS NOT NULL ORDER BY listing_region) AS listing_regions, ARRAY(SELECT DISTINCT exchange FROM etf_catalog ORDER BY exchange) AS exchanges, ARRAY(SELECT DISTINCT issuer FROM etf_catalog WHERE issuer IS NOT NULL ORDER BY issuer) AS issuers, CASE WHEN $1::boolean THEN ARRAY(SELECT DISTINCT category FROM etf_fund_stats WHERE category IS NOT NULL ORDER BY category) END AS categories`, [f.vendor]),
  ]);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const limit = q.p(CATALOG_PAGE_SIZE), offset = q.p((page - 1) * CATALOG_PAGE_SIZE);
  const list = await db.query<Row & FactsRow>(`${q.with} SELECT ${CATALOG_COLUMNS},NULL::text AS pick_symbol,${FACT_COLUMNS} ${q.from()} ORDER BY ${q.order} LIMIT ${limit} OFFSET ${offset}`, q.values);
  // Per-page reads for the 50 rows only: top-10 weight and the linked pick.
  const keys = list.rows.map((row) => row.listing_key);
  const [topTen, picks] = keys.length ? await Promise.all([
    f.vendor ? db.query<{ listing_key: string; top_ten: string | number | null }>(TOP_TEN_SQL, [keys]) : { rows: [] },
    db.query<{ listing_key: string; pick_symbol: string | null }>(PAGE_PICKS_SQL, [keys]),
  ]) : [{ rows: [] }, { rows: [] }];
  const topTenBy = new Map(topTen.rows.map((row) => [row.listing_key, num(row.top_ten)]));
  const pickBy = new Map(picks.rows.map((row) => [row.listing_key, row.pick_symbol]));
  const statsRow = statsResult.rows[0];
  const optionRow = optionsResult.rows[0];
  return { funds: list.rows.map((row) => ({ ...mapCatalogFund({ ...row, pick_symbol: pickBy.get(row.listing_key) ?? null }), facts: mapFacts(row, topTenBy.get(row.listing_key) ?? null) })), total, rated: Number(countResult.rows[0]?.rated ?? 0), withData: Number(countResult.rows[0]?.with_data ?? 0), page, pages,
    stats: { size: Number(statsRow?.size ?? 0), enriched: Number(statsRow?.enriched ?? 0), shortlist: Number(statsRow?.shortlist ?? 0), lastSync: date(statsRow?.last_sync ?? null) },
    options: { assetClasses: optionRow?.asset_classes ?? [], regions: optionRow?.regions ?? [], listingRegions: optionRow?.listing_regions ?? [], exchanges: optionRow?.exchanges ?? [], issuers: optionRow?.issuers ?? [], categories: optionRow?.categories ?? [] }, sample: false };
}

export interface RatingSummary {
  asOf: string | null; inScope: number; rated: number; notRated: number; incomplete: number;
  bands: Record<EtfBand, number>; sample: boolean;
}
const emptyBands = (): Record<EtfBand, number> => ({ rulesMet: 0, mostlyMet: 0, partlyMet: 0, fewMet: 0 });
/** Band counts of the latest current-version score run over in-scope ETFs (ETF and active ETF). */
export async function etfRatingSummary(db: Query | null = getPool()): Promise<RatingSummary> {
  if (process.env.DATA_MODE === "fixture") {
    const funds = sampleEtfCatalog.filter((fund) => IN_SCOPE_TYPES.includes(fund.instrumentType));
    const bands = emptyBands(); let rated = 0, incomplete = 0;
    for (const fund of funds) {
      const score = sampleEtfScores.get(fund.listingKey);
      if (score?.state !== "rated" || score.percent === null) continue;
      rated++; const result = etfBand(score.percent, score.evidencedMax); bands[result.band]++; if (result.incompleteData) incomplete++;
    }
    return { asOf: "2026-10-21", inScope: funds.length, rated, notRated: funds.length - rated, incomplete, bands, sample: true };
  }
  if (!db) return { asOf: null, inScope: 0, rated: 0, notRated: 0, incomplete: 0, bands: emptyBands(), sample: false };
  const result = await db.query<{ as_of: string | null; in_scope: string; rated: string; incomplete: string; rules_met: string; mostly_met: string; partly_met: string; few_met: string }>(`WITH ${latestCte("$1")},
    scored AS (SELECT c.listing_key, s.listing_key IS NOT NULL AS has_score, s.state, s.evidenced_max, ${bandSql("$1")} AS band FROM etf_catalog c
      LEFT JOIN etf_scores s ON s.listing_key=c.listing_key AND s.rules_version=$1 AND s.as_of=(SELECT as_of FROM latest)
      WHERE c.instrument_type IN ('ETF','ACTIVE_ETF'))
    SELECT (SELECT as_of::text FROM latest) AS as_of, count(*)::text AS in_scope, count(*) FILTER (WHERE state='rated')::text AS rated,
      count(*) FILTER (WHERE state='rated' AND evidenced_max < ${FULL_EVIDENCE})::text AS incomplete,
      count(*) FILTER (WHERE band='rulesMet')::text AS rules_met, count(*) FILTER (WHERE band='mostlyMet')::text AS mostly_met,
      count(*) FILTER (WHERE band='partlyMet')::text AS partly_met, count(*) FILTER (WHERE band='fewMet')::text AS few_met FROM scored`, [ETF_RULES_VERSION]);
  const r = result.rows[0];
  const inScope = Number(r?.in_scope ?? 0), rated = Number(r?.rated ?? 0);
  return { asOf: date(r?.as_of ?? null), inScope, rated, notRated: inScope - rated, incomplete: Number(r?.incomplete ?? 0),
    bands: { rulesMet: Number(r?.rules_met ?? 0), mostlyMet: Number(r?.mostly_met ?? 0), partlyMet: Number(r?.partly_met ?? 0), fewMet: Number(r?.few_met ?? 0) }, sample: false };
}

export interface TopRatedFund {
  listingKey: string; name: string; mnemonic: string | null; exchange: string; isin: string | null; assetClass: EtfAssetClass;
  percent: number; band: EtfBand; incompleteData: boolean; evidencedMax: number; groupsWithData: number; applicableGroups: number;
  terPct: number | null; aumEurM: number | null; aumGap: AumGap;
}
export interface TopRatedGroup { assetClass: EtfAssetClass; funds: TopRatedFund[] }
/** Applicable groups for a v3 score: eight, or seven when no income rule applies (accumulating funds). */
export const applicableGroups = (rules: readonly Pick<EtfRuleHit, "group">[]) => rules.some((rule) => rule.group === "income") ? 8 : 7;
const groupTop = (funds: TopRatedFund[]): TopRatedGroup[] => ETF_ASSET_CLASSES.map((assetClass) => ({ assetClass, funds: funds.filter((fund) => fund.assetClass === assetClass) })).filter((group) => group.funds.length);
const topOrder = (a: TopRatedFund, b: TopRatedFund) => RATING_BANDS.indexOf(a.band) - RATING_BANDS.indexOf(b.band) || b.percent - a.percent || b.evidencedMax - a.evidencedMax || (b.aumEurM ?? -Infinity) - (a.aumEurM ?? -Infinity) || a.listingKey.localeCompare(b.listingKey);
/**
 * The highest rated in-scope ETFs per asset class from the latest current-version run: band, then percent, then evidenced points.
 * The band already caps thin evidence at Mostly met, so a high percent on few facts does not lead.
 */
export async function etfTopRated(perClass = 5, db: Query | null = getPool(), access: CatalogAccess = {}): Promise<{ groups: TopRatedGroup[]; sample: boolean }> {
  const limit = Math.max(1, Math.min(20, Math.trunc(perClass)));
  if (process.env.DATA_MODE === "fixture") {
    const funds = sampleEtfCatalog.flatMap((fund, index): TopRatedFund[] => {
      const score = sampleEtfScores.get(fund.listingKey);
      if (!IN_SCOPE_TYPES.includes(fund.instrumentType) || score?.state !== "rated" || score.percent === null || score.rulesVersion !== ETF_RULES_VERSION) return [];
      const facts = sampleCatalogFacts(fund, index, access.vendor === true);
      return [{ listingKey: fund.listingKey, name: fund.name, mnemonic: fund.mnemonic, exchange: fund.exchange, isin: fund.isin, assetClass: fund.assetClass ?? "other",
        percent: score.percent, ...etfBand(score.percent, score.evidencedMax), evidencedMax: score.evidencedMax, groupsWithData: etfScoreCoverage(score.rules).groupsWithData,
        applicableGroups: applicableGroups(score.rules), terPct: facts.terPct, aumEurM: facts.aumEurM, aumGap: facts.aumGap }];
    });
    const groups = groupTop(funds.sort(topOrder));
    return { groups: groups.map((group) => ({ ...group, funds: group.funds.slice(0, limit) })), sample: true };
  }
  if (!db) return { groups: [], sample: false };
  const result = await db.query<{ listing_key: string; name: string; mnemonic: string | null; exchange: string; isin: string | null; asset_class: EtfAssetClass | null; earned: number; evidenced_max: number; rule_hits: EtfRuleHit[]; fact_ter_pct: string | number | null; aum_eur_m: string | number | null; aum_gap: AumGap }>(`WITH ${FX_CTE}, ${latestCte("$1")},
    ranked AS (SELECT c.listing_key,c.name,c.mnemonic,c.exchange,c.isin,c.asset_class,s.earned,s.evidenced_max,s.rule_hits,${TER} AS fact_ter_pct,${AUM_EUR} AS aum_eur_m,${AUM_GAP} AS aum_gap,
      row_number() OVER (PARTITION BY COALESCE(c.asset_class,'other') ORDER BY ${BAND_RANK(bandSql("$1"))}, ${PCT} DESC, s.evidenced_max DESC, (${AUM_EUR}) DESC NULLS LAST, c.listing_key) AS rank
      FROM etf_catalog c JOIN etf_scores s ON s.listing_key=c.listing_key AND s.rules_version=$1 AND s.as_of=(SELECT as_of FROM latest)
      ${statsJoin("$2")} LEFT JOIN fx ON true
      WHERE s.state='rated' AND s.evidenced_max > 0 AND c.instrument_type IN ('ETF','ACTIVE_ETF'))
    SELECT * FROM ranked WHERE rank <= $3 ORDER BY asset_class, rank`, [ETF_RULES_VERSION, access.vendor === true, limit]);
  const funds = result.rows.map((row): TopRatedFund => {
    const earned = Number(row.earned), evidencedMax = Number(row.evidenced_max), percent = Math.round(earned / evidencedMax * 100);
    const rules = Array.isArray(row.rule_hits) ? row.rule_hits : [];
    return { listingKey: row.listing_key, name: row.name, mnemonic: row.mnemonic, exchange: row.exchange, isin: row.isin, assetClass: row.asset_class ?? "other",
      percent, ...etfBand(percent, evidencedMax), evidencedMax, groupsWithData: etfScoreCoverage(rules).groupsWithData, applicableGroups: applicableGroups(rules),
      terPct: num(row.fact_ter_pct), aumEurM: num(row.aum_eur_m), aumGap: row.aum_gap };
  });
  return { groups: groupTop(funds.sort(topOrder)), sample: false };
}

export const RESEARCH_CANDIDATE_LIMIT = 150;
type ResearchRow = {
  listingKey: string; isin: string | null; name: string; symbol: string; exchange: string; listingRegion: string | null; tradingCurrency: string | null; issuer: string | null;
  assetClass: EtfAssetClass | null; region: string | null; theme: string | null; trackedIndex: string | null; terPct: string | number | null; aumUsdM: string | number | null;
  domicile: string | null; replication: string | null; distribution: "acc" | "dist" | null; sourceUrl: string | null; ratingAsOf: string; earned: number; evidenced_max: number;
};
/**
 * Optional input for the owner's model research: the highest rated recent ETF listings of the latest current-version run, in the
 * shortlist item shape plus the rating context. Same order as the list: band, percent, evidenced points, then EUR AUM.
 */
export async function etfResearchCandidates(limit: number, db: Query) {
  const bounded = Math.max(1, Math.min(RESEARCH_CANDIDATE_LIMIT, Math.trunc(Number.isFinite(limit) ? limit : 25)));
  const result = await db.query<ResearchRow>(`WITH ${FX_CTE}, ${latestCte("$1")}
    SELECT c.listing_key AS "listingKey",c.isin,c.name,c.mnemonic AS symbol,c.exchange,c.listing_region AS "listingRegion",c.trading_currency AS "tradingCurrency",c.issuer,
      c.asset_class AS "assetClass",c.region,c.theme,c.tracked_index AS "trackedIndex",c.ter_pct AS "terPct",c.aum_usd_m AS "aumUsdM",
      c.domicile,c.replication,c.distribution,c.source_url AS "sourceUrl",s.earned,s.evidenced_max,s.as_of::text AS "ratingAsOf"
    FROM etf_catalog c JOIN etf_scores s ON s.listing_key=c.listing_key AND s.rules_version=$1 AND s.as_of=(SELECT as_of FROM latest)
    ${statsJoin("true")} LEFT JOIN fx ON true
    WHERE s.state='rated' AND s.evidenced_max > 0 AND c.instrument_type IN ('ETF','ACTIVE_ETF') AND c.mnemonic IS NOT NULL AND c.last_seen >= CURRENT_DATE - 30
    ORDER BY ${BAND_RANK(bandSql("$1"))}, ${PCT} DESC, s.evidenced_max DESC, (${AUM_EUR}) DESC NULLS LAST, c.listing_key LIMIT $2`, [ETF_RULES_VERSION, bounded]);
  return result.rows.map(({ earned, evidenced_max: evidencedMax, ...row }) => {
    const percent = Math.round(Number(earned) / Number(evidencedMax) * 100);
    const { band, incompleteData } = etfBand(percent, Number(evidencedMax));
    return { ...row, terPct: num(row.terPct), aumUsdM: num(row.aumUsdM), ratingPercent: percent, ratingBand: band, ratingIncompleteData: incompleteData, evidencedPoints: Number(evidencedMax) };
  });
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
/** Match a pick to its own listing before reading a stored score. */
export async function etfCatalogKeyForPick(pick: { isin: string | null; exchange: string | null; symbol: string }, db: Query | null = getPool()): Promise<string | null> {
  const matches = (fund: CatalogFund) => (pick.exchange === null || fund.exchange === pick.exchange) &&
    (pick.isin ? fund.isin === pick.isin : pick.exchange !== null && fund.mnemonic === pick.symbol);
  if (process.env.DATA_MODE === "fixture") return sampleEtfCatalog.find(matches)?.listingKey ?? null;
  if (!db || (!pick.isin && !pick.exchange)) return null;
  const result = await db.query<{ listing_key: string }>(`SELECT listing_key FROM etf_catalog WHERE ($1::text IS NOT NULL AND isin=$1 AND ($2::text IS NULL OR exchange=$2)) OR ($1::text IS NULL AND $2::text IS NOT NULL AND exchange=$2 AND mnemonic=$3) ORDER BY listing_key LIMIT 1`, [pick.isin, pick.exchange, pick.symbol]);
  return result.rows[0]?.listing_key ?? null;
}
function statsFrom(funds: CatalogFund[]): CatalogStats {
  return { size: funds.length, enriched: funds.filter((f) => f.enrichmentStatus === "ok").length,
    shortlist: funds.filter((f) => f.shortlist).length, lastSync: funds.reduce<string | null>((latest, f) => !latest || f.lastSeen > latest ? f.lastSeen : latest, null) };
}
function optionsFrom(funds: CatalogFund[]): CatalogOptions {
  const values = (field: "assetClass" | "region" | "listingRegion" | "exchange" | "issuer") => [...new Set(funds.map((f) => f[field]).filter((v): v is string => Boolean(v)))].sort();
  return { assetClasses: values("assetClass"), regions: values("region"), listingRegions: values("listingRegion"), exchanges: values("exchange"), issuers: values("issuer"), categories: [] };
}
