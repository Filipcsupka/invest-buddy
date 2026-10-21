import type pg from "pg";
import { REVENUE_CONCEPTS } from "../collectors/sources/frames";
import { barMetrics, revenueGrowth, type Candidate } from "./select";
import { usdPerUnit } from "./market";

type Q = Pick<pg.Pool, "query">;
type Listing = { ticker: string; name: string; sector: string; vendor_symbol: string | null; exchange: string | null; currency: string | null; type: string | null };

/** Read the same stored bars and fundamentals used by scoring, restricted to facts first observed by asOf. */
export async function loadCandidates(db: Q, asOf: string, secCik: Map<string, number> = new Map()): Promise<Candidate[]> {
  const members = await db.query<{ ticker: string }>(
    "SELECT ticker FROM universe_membership WHERE valid_from<=$1 AND (valid_to IS NULL OR valid_to>$1) AND list<>'benchmark' AND (list<>'extended' OR added_by='seed')", [asOf]);
  const core = new Set(members.rows.map((r) => r.ticker));
  const names = await db.query<Listing>(`SELECT i.ticker,i.name,i.sector,s.vendor_symbol,s.exchange,s.currency,s.type FROM instruments i
    LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_from<=$1::date AND (ids.valid_to IS NULL OR ids.valid_to>$1::date)
    LEFT JOIN LATERAL (SELECT vendor_symbol,exchange,currency,type FROM symbols s
      WHERE s.first_seen<=$1::date AND (NOT s.delisted OR s.last_seen>=$1::date) AND
        (s.vendor_symbol=ids.vendor_symbols->>'eodhd' OR s.vendor_symbol=i.ticker OR (s.exchange='US' AND s.code=i.ticker))
      ORDER BY CASE WHEN s.vendor_symbol=ids.vendor_symbols->>'eodhd' THEN 0 WHEN s.exchange='US' AND s.code=i.ticker THEN 1 ELSE 2 END, s.vendor_symbol LIMIT 1) s ON true
    WHERE i.source<>'benchmark' ORDER BY i.ticker`, [asOf]);
  const bars = await db.query<{ ticker: string; bar_date: string; close: string; volume: string; source_id: string; vendor_symbol: string | null; currency: string | null }>(
    `SELECT ticker,bar_date::text,close,volume,source_id,vendor_symbol,currency FROM daily_bars
     WHERE bar_date<=$1::date ORDER BY ticker,bar_date`, [asOf]);
  const listing = new Map(names.rows.map((row) => [row.ticker, row]));
  const barMap = new Map<string, { close: number; volume: number }[]>();
  for (const b of bars.rows) {
    const l = listing.get(b.ticker);
    if (!l) continue;
    // European listings use only EODHD bars for the exact vendor symbol and quote currency. US listings also keep legacy USD bars,
    // which have no currency and, before migration 023, no fetch time.
    const exact = b.source_id === "eodhd" && b.vendor_symbol === l.vendor_symbol && !!l.currency && b.currency?.toUpperCase() === l.currency.toUpperCase();
    const legacyUs = (l.exchange ?? "US") === "US" && b.source_id !== "eodhd" && (!b.currency || b.currency.toUpperCase() === "USD");
    if (!exact && !legacyUs) continue;
    (barMap.get(b.ticker) ?? barMap.set(b.ticker, []).get(b.ticker)!).push({ close: Number(b.close), volume: Number(b.volume) });
  }
  const ids = await db.query<{ ticker: string; cik: string | null }>("SELECT ticker,cik::text FROM instrument_ids WHERE valid_from<=$1::date AND (valid_to IS NULL OR valid_to>$1::date) AND cik IS NOT NULL", [asOf]);
  const cikMap = new Map(ids.rows.map((r) => [r.ticker, Number(r.cik)]));
  const forms = await db.query<{ symbol: string; form: string }>("SELECT DISTINCT symbol,form FROM filing_watch WHERE filed_at<=$1::date", [asOf]);
  const formMap = new Map<string, string[]>();
  for (const f of forms.rows) (formMap.get(f.symbol) ?? formMap.set(f.symbol, []).get(f.symbol)!).push(f.form);
  const rev = await db.query<{ ticker: string; concept: string; period_end: string; value: string; form: string; taxonomy: string; unit: string; source_id: string }>(
    `SELECT DISTINCT ON (ticker,source_id,concept,period_end) ticker,concept,period_end::text,value::text,form,taxonomy,unit,source_id
     FROM fundamentals_pit WHERE filed<=$1::date AND (first_seen_at AT TIME ZONE 'UTC')::date<=$1::date AND period_start IS NOT NULL
       AND period_end-period_start BETWEEN 80 AND 100 AND
       ((source_id='eodhd' AND taxonomy='eodhd' AND concept='Revenues') OR
        (source_id='sec' AND taxonomy='us-gaap' AND unit='USD' AND concept=ANY($2)))
     ORDER BY ticker,source_id,concept,period_end,filed DESC`, [asOf, [...REVENUE_CONCEPTS]]);
  const shares = await db.query<{ ticker: string; value: string; source_id: string }>(
    `SELECT DISTINCT ON (ticker,source_id) ticker,value::text,source_id FROM fundamentals_pit
     WHERE filed<=$1::date AND (first_seen_at AT TIME ZONE 'UTC')::date<=$1::date AND period_end<=$1::date
       AND concept='EntityCommonStockSharesOutstanding' AND unit='shares' AND source_id IN ('eodhd','sec')
     ORDER BY ticker,source_id,period_end DESC,filed DESC`, [asOf]);
  const sharesBySource = new Map(shares.rows.map((row) => [`${row.ticker}:${row.source_id}`, Number(row.value)]));
  const revMap = new Map<string, Map<string, { periodEnd: string; value: number }[]>>();
  for (const r of rev.rows) {
    const l = listing.get(r.ticker);
    if (!l || (r.source_id === "sec" && l.exchange !== "US" && l.exchange !== null)) continue;
    const key = `${r.source_id}:${r.concept}:${r.unit}`;
    const byConcept = revMap.get(r.ticker) ?? revMap.set(r.ticker, new Map()).get(r.ticker)!;
    (byConcept.get(key) ?? byConcept.set(key, []).get(key)!).push({ periodEnd: r.period_end, value: Number(r.value) });
    if (r.source_id === "sec") (formMap.get(r.ticker) ?? formMap.set(r.ticker, []).get(r.ticker)!).push(r.form);
  }
  const fx = await db.query<{ series_id: string; value: string }>(
    `SELECT DISTINCT ON (series_id) series_id,value::text FROM macro_observations
     WHERE source_id='ecb' AND obs_date<=$1::date AND realtime_start<=$1::date AND (observed_at AT TIME ZONE 'UTC')::date<=$1::date
     ORDER BY series_id,obs_date DESC,realtime_start DESC`, [asOf]);
  const rates = new Map(fx.rows.map((row) => [row.series_id, Number(row.value)]));
  return names.rows.map((n) => {
    const concepts = [...(revMap.get(n.ticker)?.entries() ?? [])].sort(([a, x], [b, y]) =>
      Number(y.length >= 4) - Number(x.length >= 4) || Number(b.startsWith("eodhd:")) - Number(a.startsWith("eodhd:")) || y.length - x.length || a.localeCompare(b));
    const quarters = concepts[0]?.[1] ?? [];
    const growth = revenueGrowth(quarters);
    const priorYoyGrowthPct = revenueGrowth(quarters.slice(0, -1)).yoyGrowthPct;
    const metrics = barMetrics(barMap.get(n.ticker) ?? []);
    const exchange = n.exchange ?? "US", currency = n.currency?.toUpperCase() ?? (n.exchange === null ? "USD" : "");
    const usCode = exchange === "US" && n.ticker.endsWith(".US") ? n.ticker.slice(0, -3) : n.ticker;
    const conversion = usdPerUnit(currency, rates);
    const count = sharesBySource.get(`${n.ticker}:eodhd`) ?? (exchange === "US" ? sharesBySource.get(`${n.ticker}:sec`) ?? sharesBySource.get(`${usCode}:sec`) : undefined);
    return { ticker: n.ticker, name: n.name, sector: n.sector, cik: cikMap.get(n.ticker) ?? secCik.get(n.ticker) ?? secCik.get(usCode) ?? null,
      exchange, currency, vendorSymbol: n.vendor_symbol, securityType: n.type, usdPerUnit: conversion, marketCapUsd: metrics.lastClose !== null && conversion !== null && count ? metrics.lastClose * count * conversion : null,
      forms: formMap.get(n.ticker) ?? formMap.get(usCode) ?? [], core: core.has(n.ticker), revenueQuarters: growth.quarters, yoyGrowthPct: growth.yoyGrowthPct,
      priorYoyGrowthPct, ...metrics };
  });
}
