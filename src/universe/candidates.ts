import type pg from "pg";
import { REVENUE_CONCEPTS } from "../collectors/sources/frames";
import { barMetrics, revenueGrowth, type Candidate, type RevenuePeriod } from "./select";
import { fxConversion, normalizeCurrency, suffixExchange, type FxObservation } from "./market";
import { sectorFromEodhd, UNCLASSIFIED } from "./sector";

type Q = Pick<pg.Pool, "query">;
type NameRow = {
  ticker: string; name: string; sector: string; vendor_symbol: string | null; exchange: string | null; currency: string | null; type: string | null;
  /** Exchange of the latest symbols row, whatever its first_seen. symbols is current state, not history. */
  current_exchange: string | null;
  /** EODHD General.Industry of the dated symbols row, only when it was stored by asOf. */
  industry: string | null;
};
type Listing = { row: NameRow; exchange: string; currency: string; us: boolean; issue?: "listing_not_synced" };
type Bar = { close: number; volume: number; currency: string | null };

const SYMBOL_MATCH = `(s.vendor_symbol=ids.vendor_symbols->>'eodhd' OR s.vendor_symbol=i.ticker OR (s.exchange='US' AND s.code=i.ticker))`;
const SYMBOL_ORDER = `CASE WHEN s.vendor_symbol=ids.vendor_symbols->>'eodhd' THEN 0 WHEN s.exchange='US' AND s.code=i.ticker THEN 1 ELSE 2 END, s.vendor_symbol`;

/**
 * Listing for the score date. A symbols row first seen on or before asOf gives the exchange and quote currency. Without one, an
 * instrument whose latest symbols row or key suffix names a European exchange fails closed (listing_not_synced): symbols keeps no
 * history, so its exchange and currency on asOf are unknown and it is never treated as a US dollar line. Everything else is a
 * US listing, read as before the market-aware model. A US symbols row without a currency is read the same way.
 */
function listingFor(row: NameRow): Listing {
  if (row.exchange && row.exchange !== "US") return { row, exchange: row.exchange, currency: normalizeCurrency(row.currency) ?? "", us: false };
  if (row.exchange === "US") return { row, exchange: "US", currency: normalizeCurrency(row.currency) ?? "USD", us: true };
  const nonUs = row.current_exchange && row.current_exchange !== "US" ? row.current_exchange : suffixExchange(row.ticker);
  if (nonUs) return { row, exchange: nonUs, currency: "", us: false, issue: "listing_not_synced" };
  return { row, exchange: "US", currency: "USD", us: true };
}

const isPound = (currency: string | null) => currency === "GBP" || currency === "GBX";

/** Bars for the listing: US lines keep every USD or unlabelled bar; other lines need EODHD bars for the exact vendor symbol and currency. */
function acceptsBar(l: Listing, bar: { source_id: string; vendor_symbol: string | null; currency: string | null }): boolean {
  const currency = normalizeCurrency(bar.currency);
  if (l.us) return currency === null || currency === "USD";
  if (l.issue || bar.source_id !== "eodhd" || bar.vendor_symbol !== l.row.vendor_symbol || !l.currency) return false;
  // LSE lines can be quoted in pounds or pence; both are read here and the quote unit is decided per window below.
  return currency === l.currency || (l.exchange === "LSE" && isPound(l.currency) && isPound(currency));
}

/**
 * An LSE pound line is only usable when the quote unit is marked as pence. The bars used must all carry GBX (a bar-level marker,
 * copied from symbols at ingest), or with no bars the symbols row must say GBX. Plain GBP is ambiguous, because EODHD may price
 * an LSE line in pence while the symbol master says GBP, which would overstate price, traded value and market cap 100 times.
 */
function lseQuote(l: Listing, window: Bar[]): { currency: string; issue?: "currency_unverified_gbx" } {
  if (l.exchange !== "LSE" || !isPound(l.currency)) return { currency: l.currency };
  const verified = window.length ? window.every((bar) => normalizeCurrency(bar.currency) === "GBX") : l.currency === "GBX";
  return verified ? { currency: "GBX" } : { currency: l.currency, issue: "currency_unverified_gbx" };
}

/** Read the same stored bars and fundamentals used by scoring, restricted to facts first observed by asOf. */
export async function loadCandidates(db: Q, asOf: string, secCik: Map<string, number> = new Map()): Promise<Candidate[]> {
  const members = await db.query<{ ticker: string }>(
    "SELECT ticker FROM universe_membership WHERE valid_from<=$1 AND (valid_to IS NULL OR valid_to>$1) AND list<>'benchmark' AND (list<>'extended' OR added_by='seed')", [asOf]);
  const core = new Set(members.rows.map((r) => r.ticker));
  // Discovery-only names (discovery_price_bars without an instruments row) stay candidates, as in the D35 loader.
  const names = await db.query<NameRow>(`SELECT i.ticker,i.name,i.sector,s.vendor_symbol,s.exchange,s.currency,s.type,cur.exchange current_exchange,s.industry FROM instruments i
    LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_from<=$1::date AND (ids.valid_to IS NULL OR ids.valid_to>$1::date)
    LEFT JOIN LATERAL (SELECT vendor_symbol,exchange,currency,type,CASE WHEN s.sector_observed_on<=$1::date THEN s.industry END industry FROM symbols s
      WHERE s.first_seen<=$1::date AND (NOT s.delisted OR s.last_seen>=$1::date) AND ${SYMBOL_MATCH}
      ORDER BY ${SYMBOL_ORDER} LIMIT 1) s ON true
    LEFT JOIN LATERAL (SELECT exchange FROM symbols s WHERE ${SYMBOL_MATCH} ORDER BY ${SYMBOL_ORDER} LIMIT 1) cur ON true
    WHERE i.source<>'benchmark'
    UNION ALL
    (SELECT DISTINCT ON (d.symbol) d.symbol,d.name,d.sector,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text FROM discovery_price_bars d
      WHERE NOT EXISTS (SELECT 1 FROM instruments i WHERE i.ticker=d.symbol AND i.source<>'benchmark') ORDER BY d.symbol,d.bar_date DESC)
    ORDER BY 1`, [asOf]);
  // daily_bars wins over discovery_price_bars on the same date, as in the D35 loader.
  const bars = await db.query<{ ticker: string; bar_date: string; close: string; volume: string; source_id: string; vendor_symbol: string | null; currency: string | null; origin: string }>(
    `SELECT ticker,bar_date::text,close,volume,source_id,vendor_symbol,currency,'daily' origin FROM daily_bars WHERE bar_date<=$1::date
     UNION ALL SELECT symbol,bar_date::text,close,volume,'discovery',NULL,NULL,'discovery' FROM discovery_price_bars WHERE bar_date<=$1::date
     ORDER BY 1,2,8`, [asOf]);
  const listing = new Map(names.rows.map((row) => [row.ticker, listingFor(row)]));
  const barMap = new Map<string, Bar[]>();
  let lastDaily = "";
  for (const b of bars.rows) {
    const l = listing.get(b.ticker);
    if (!l) continue;
    // Rows are ordered by ticker, date and origin, so a daily_bars row directly precedes a discovery row for the same date.
    if (b.origin === "daily") lastDaily = `${b.ticker}:${b.bar_date}`;
    else if (!l.us || lastDaily === `${b.ticker}:${b.bar_date}`) continue;
    if (b.origin === "daily" && !acceptsBar(l, b)) continue;
    (barMap.get(b.ticker) ?? barMap.set(b.ticker, []).get(b.ticker)!).push({ close: Number(b.close), volume: Number(b.volume), currency: b.currency });
  }
  const ids = await db.query<{ ticker: string; cik: string | null }>("SELECT ticker,cik::text FROM instrument_ids WHERE valid_from<=$1::date AND (valid_to IS NULL OR valid_to>$1::date) AND cik IS NOT NULL", [asOf]);
  const cikMap = new Map(ids.rows.map((r) => [r.ticker, Number(r.cik)]));
  const forms = await db.query<{ symbol: string; form: string }>("SELECT DISTINCT symbol,form FROM filing_watch WHERE filed_at<=$1::date", [asOf]);
  const formMap = new Map<string, string[]>();
  for (const f of forms.rows) (formMap.get(f.symbol) ?? formMap.set(f.symbol, []).get(f.symbol)!).push(f.form);
  // Quarterly (80-100 days) facts for every source; EODHD half-years (170-195 days) for non-US listings that report semi-annually.
  const rev = await db.query<{ ticker: string; concept: string; period: RevenuePeriod; period_end: string; value: string; form: string; taxonomy: string; unit: string; source_id: string }>(
    `SELECT DISTINCT ON (ticker,source_id,concept,period,period_end) ticker,concept,period,period_end::text,value::text,form,taxonomy,unit,source_id FROM (
       SELECT f.*,CASE WHEN period_end-period_start BETWEEN 80 AND 100 THEN 'quarter' ELSE 'half' END period FROM fundamentals_pit f
       WHERE filed<=$1::date AND (first_seen_at AT TIME ZONE 'UTC')::date<=$1::date AND period_start IS NOT NULL
         AND (period_end-period_start BETWEEN 80 AND 100 OR (source_id='eodhd' AND period_end-period_start BETWEEN 170 AND 195)) AND
         ((source_id='eodhd' AND taxonomy='eodhd' AND concept='Revenues') OR
          (source_id='sec' AND taxonomy='us-gaap' AND unit='USD' AND concept=ANY($2)))) f
     ORDER BY ticker,source_id,concept,period,period_end,filed DESC`, [asOf, [...REVENUE_CONCEPTS]]);
  const shares = await db.query<{ ticker: string; value: string; source_id: string }>(
    `SELECT DISTINCT ON (ticker,source_id) ticker,value::text,source_id FROM fundamentals_pit
     WHERE filed<=$1::date AND (first_seen_at AT TIME ZONE 'UTC')::date<=$1::date AND period_end<=$1::date
       AND concept='EntityCommonStockSharesOutstanding' AND unit='shares' AND source_id IN ('eodhd','sec')
     ORDER BY ticker,source_id,period_end DESC,filed DESC`, [asOf]);
  const sharesBySource = new Map(shares.rows.map((row) => [`${row.ticker}:${row.source_id}`, Number(row.value)]));
  const revMap = new Map<string, Map<string, { periodEnd: string; value: number }[]>>();
  for (const r of rev.rows) {
    const l = listing.get(r.ticker);
    if (!l || (r.source_id === "sec" && !l.us) || (r.period === "half" && l.us)) continue;
    const key = `${r.source_id}:${r.concept}:${r.unit}:${r.period}`;
    const byConcept = revMap.get(r.ticker) ?? revMap.set(r.ticker, new Map()).get(r.ticker)!;
    (byConcept.get(key) ?? byConcept.set(key, []).get(key)!).push({ periodEnd: r.period_end, value: Number(r.value) });
    if (r.source_id === "sec") (formMap.get(r.ticker) ?? formMap.set(r.ticker, []).get(r.ticker)!).push(r.form);
  }
  const fx = await db.query<{ series_id: string; obs_date: string; value: string }>(
    `SELECT DISTINCT ON (series_id) series_id,obs_date::text,value::text FROM macro_observations
     WHERE source_id='ecb' AND obs_date<=$1::date AND realtime_start<=$1::date AND (observed_at AT TIME ZONE 'UTC')::date<=$1::date
     ORDER BY series_id,obs_date DESC,realtime_start DESC`, [asOf]);
  const rates = new Map<string, FxObservation>(fx.rows.map((row) => [row.series_id, { value: Number(row.value), date: row.obs_date }]));
  const periodOf = (key: string): RevenuePeriod => (key.endsWith(":half") ? "half" : "quarter");
  const enough = (key: string, count: number) => count >= (periodOf(key) === "half" ? 3 : 4);
  return names.rows.map((n) => {
    const l = listing.get(n.ticker)!;
    // Prefer a series long enough to qualify, then EODHD, then half-years over quarters (a half-year reporter's older EODHD rows
    // were stored as three-month periods), then the longest series.
    const concepts = [...(revMap.get(n.ticker)?.entries() ?? [])].sort(([a, x], [b, y]) =>
      Number(enough(b, y.length)) - Number(enough(a, x.length)) || Number(b.startsWith("eodhd:")) - Number(a.startsWith("eodhd:"))
      || Number(periodOf(b) === "half") - Number(periodOf(a) === "half") || y.length - x.length || (a < b ? -1 : a > b ? 1 : 0));
    const [key, periods] = concepts[0] ?? ["", []];
    const growth = revenueGrowth(periods);
    const priorYoyGrowthPct = revenueGrowth(periods.slice(0, -1)).yoyGrowthPct;
    const series = barMap.get(n.ticker) ?? [];
    const metrics = barMetrics(series);
    const quote = lseQuote(l, series.slice(-50));
    const usCode = l.exchange === "US" && n.ticker.endsWith(".US") ? n.ticker.slice(0, -3) : n.ticker;
    const conversion = quote.currency ? fxConversion(quote.currency, rates, asOf) : { usdPerUnit: null, reason: "fx_unavailable" as const };
    const count = sharesBySource.get(`${n.ticker}:eodhd`) ?? (l.exchange === "US" ? sharesBySource.get(`${n.ticker}:sec`) ?? sharesBySource.get(`${usCode}:sec`) : undefined);
    const listingIssue = l.issue ?? quote.issue;
    // European listings have no SIC code; an Unclassified one takes its sector from the stored EODHD industry. US names are unchanged.
    const sector = !l.us && n.sector === UNCLASSIFIED ? sectorFromEodhd(n.industry) : n.sector;
    return { ticker: n.ticker, name: n.name, sector, cik: cikMap.get(n.ticker) ?? secCik.get(n.ticker) ?? secCik.get(usCode) ?? null,
      exchange: l.exchange, currency: quote.currency, vendorSymbol: n.vendor_symbol, securityType: n.type, usdPerUnit: conversion.usdPerUnit,
      marketCapUsd: metrics.lastClose !== null && conversion.usdPerUnit !== null && count ? metrics.lastClose * count * conversion.usdPerUnit : null,
      forms: formMap.get(n.ticker) ?? formMap.get(usCode) ?? [], core: core.has(n.ticker), revenueQuarters: growth.quarters, yoyGrowthPct: growth.yoyGrowthPct,
      priorYoyGrowthPct, ...metrics,
      ...(key && periodOf(key) === "half" ? { revenuePeriod: "half" as const } : {}),
      ...(listingIssue ? { listingIssue } : {}),
      ...(conversion.reason === "fx_stale" ? { fxIssue: "fx_stale" as const } : {}) };
  });
}
