import type pg from "pg";

type Db = Pick<pg.Pool, "query">;
export type DataRow = Record<string, unknown>;
const rows = async (db: Db, sql: string, values: unknown[] = []): Promise<DataRow[]> => (await db.query(sql, values)).rows;
const optionalRows = async (db: Db, sql: string): Promise<DataRow[]> => {
  try { return await rows(db, sql); } catch (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw error;
  }
};

/** All reads are bounded. Dates and source identifiers stay beside their values. */
export async function ownerDataOverview(db: Db, etfPage = 1) {
  const page = Math.max(1, Math.min(100000, Math.trunc(etfPage) || 1));
  const [sources, usage, exchanges, universe, etfs, etfCount, macro, jobs] = await Promise.all([
    rows(db, `SELECT 'Symbols' AS family,count(*)::int AS records,max(last_seen)::text AS latest FROM symbols
      UNION ALL SELECT 'Daily bars',count(*)::int,max(bar_date)::text FROM daily_bars WHERE source_id='eodhd'
      UNION ALL SELECT 'Revenue and shares',count(*)::int,max(period_end)::text FROM fundamentals_pit WHERE source_id='eodhd'
      UNION ALL SELECT 'EPS history',count(*)::int,max(fiscal_date_ending)::text FROM eps_history WHERE source_id='eodhd'
      UNION ALL SELECT 'Earnings calendar',count(*)::int,max(observed_on)::text FROM earnings_calendar_snapshots WHERE source_id='eodhd'
      UNION ALL SELECT 'Catalyst facts',count(*)::int,max(as_of)::text FROM collected_facts WHERE source_id='eodhd'
      UNION ALL SELECT 'Insider lines',count(*)::int,max(transaction_date)::text FROM insider_transactions WHERE source_id='eodhd'
      UNION ALL SELECT 'News documents',count(*)::int,max(published_at)::text FROM source_documents WHERE source_id='eodhd'
      UNION ALL SELECT 'Regional macro',count(*)::int,max(obs_date)::text FROM macro_observations WHERE source_id IN ('eodhd','ecb')
      UNION ALL SELECT 'ETF catalog',count(*)::int,max(enriched_at)::text FROM etf_catalog WHERE enrichment_source='eodhd'`),
    rows(db, `SELECT day::text,job,sum(requests)::int AS requests,sum(credits)::text AS credits FROM api_usage WHERE source_id='eodhd' AND day >= current_date-6 GROUP BY day,job ORDER BY day DESC,job LIMIT 60`),
    rows(db, `SELECT exchange,count(*)::int AS symbols,count(*) FILTER (WHERE NOT delisted)::int AS active,max(last_seen)::text AS last_seen FROM symbols GROUP BY exchange ORDER BY exchange`),
    rows(db, `SELECT exchange,list,count(*)::int AS tickers,string_agg(ticker,', ' ORDER BY ticker) AS symbols,max(valid_from)::text AS latest_change FROM universe_membership WHERE valid_to IS NULL GROUP BY exchange,list ORDER BY exchange,list`),
    rows(db, `SELECT listing_key,name,exchange,region,ter_pct::text,aum_usd_m::text,holdings_count,enrichment_status,enriched_at::text,enrichment_source FROM etf_catalog WHERE enrichment_source='eodhd' ORDER BY enriched_at DESC NULLS LAST,listing_key LIMIT 100 OFFSET $1`, [(page - 1) * 100]),
    rows(db, `SELECT count(*)::int AS count FROM etf_catalog WHERE enrichment_source='eodhd'`),
    rows(db, `SELECT DISTINCT ON (series_id) series_id,obs_date::text,value::text,source_id,observed_at::text FROM macro_observations WHERE source_id IN ('eodhd','ecb') ORDER BY series_id,obs_date DESC,observed_at DESC LIMIT 50`),
    rows(db, `SELECT DISTINCT ON (job) job,status,started_at::text,ended_at::text,counts FROM job_runs WHERE job ILIKE '%eodhd%' OR job IN ('symbols-sync','etf-enrich') ORDER BY job,started_at DESC LIMIT 50`),
  ]);
  const [assets, callLog, assetSummary] = await Promise.all([
    optionalRows(db, `SELECT a.vendor_symbol,a.asset_class,a.name,a.exchange,a.currency,b.bar_date::text,b.close::text,b.volume::text,b.source_id FROM tracked_assets a LEFT JOIN LATERAL (SELECT bar_date,close,volume,source_id FROM asset_bars WHERE vendor_symbol=a.vendor_symbol ORDER BY bar_date DESC LIMIT 1) b ON true WHERE a.enabled ORDER BY a.asset_class,a.sort,a.vendor_symbol LIMIT 100`),
    optionalRows(db, `SELECT job,run_date::text,calls,source_id FROM eodhd_call_log ORDER BY run_date DESC,job LIMIT 60`),
    optionalRows(db, `SELECT 'Market asset bars' AS family,count(*)::int AS records,max(bar_date)::text AS latest FROM asset_bars WHERE source_id='eodhd'`),
  ]);
  return { sources: [...sources, ...assetSummary], usage, exchanges, universe, etfs, etfPage: page, etfPages: Math.max(1, Math.ceil(Number(etfCount[0]?.count ?? 0) / 100)), macro, jobs, assets, callLog };
}

export async function ownerTickerData(db: Db, ticker: string) {
  const [identity, bars, fundamentals, eps, calendar, catalysts, insiders, documents] = await Promise.all([
    rows(db, `SELECT i.ticker,i.name,i.sector,s.vendor_symbol,s.exchange,s.currency,s.country,s.sector AS vendor_sector,s.industry,s.sector_observed_on::text,s.last_seen::text,s.delisted FROM instruments i LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL LEFT JOIN LATERAL (
      SELECT s.* FROM symbols s WHERE s.vendor_symbol=ids.vendor_symbols->>'eodhd'
        OR (s.code=split_part(i.ticker,'.',1) AND (s.exchange=ids.exchange OR (ids.exchange IN ('NASDAQ','NYSE') AND s.exchange='US')))
      ORDER BY COALESCE(s.vendor_symbol=ids.vendor_symbols->>'eodhd',false) DESC,s.delisted,s.last_seen DESC LIMIT 1
    ) s ON true WHERE i.ticker=$1 LIMIT 1`, [ticker]),
    rows(db, `SELECT bar_date::text,open::text,high::text,low::text,close::text,volume::text,currency,vendor_symbol,source_id,fetched_at::text FROM daily_bars WHERE ticker=$1 AND source_id='eodhd' ORDER BY bar_date DESC LIMIT 20`, [ticker]),
    rows(db, `SELECT concept,period_start::text,period_end::text,filed::text,value::text,unit,form,source_id,first_seen_at::text FROM (
      SELECT *,row_number() OVER (PARTITION BY concept,unit ORDER BY period_end DESC,first_seen_at DESC) AS rn FROM fundamentals_pit WHERE ticker=$1 AND source_id='eodhd'
    ) f WHERE rn<=8 ORDER BY period_end DESC,first_seen_at DESC LIMIT 80`, [ticker]),
    rows(db, `SELECT fiscal_date_ending::text,reported_date::text,reported_eps::text,estimated_eps::text,surprise_pct::text,observed_at::text,source_id FROM eps_history WHERE ticker=$1 AND source_id='eodhd' ORDER BY fiscal_date_ending DESC,observed_at DESC LIMIT 20`, [ticker]),
    rows(db, `SELECT observed_on::text,report_date::text,fiscal_date_ending::text,estimate::text,currency,time_of_day,source_id FROM earnings_calendar_snapshots WHERE ticker=$1 AND source_id='eodhd' ORDER BY observed_on DESC,report_date DESC LIMIT 20`, [ticker]),
    rows(db, `SELECT fact_key,as_of::text,value,computed_at::text,source_id FROM collected_facts WHERE symbol=$1 AND source_id='eodhd' ORDER BY as_of DESC,computed_at DESC LIMIT 20`, [ticker]),
    rows(db, `SELECT transaction_date::text,filed_at::text,owner_name,code,shares::text,price::text,acquired_disposed,shares_after::text,source_id,first_observed_at::text FROM insider_transactions WHERE ticker=$1 AND source_id='eodhd' ORDER BY transaction_date DESC,line_no LIMIT 30`, [ticker]),
    rows(db, `SELECT doc_type,published_at::text,fetched_at::text,split_part(url,'?',1) AS url,meta->>'title' AS title,meta->>'sentiment' AS sentiment,source_id FROM source_documents WHERE symbol=$1 AND source_id='eodhd' ORDER BY published_at DESC LIMIT 20`, [ticker]),
  ]);
  return { identity: identity[0] ?? null, bars, fundamentals, eps, calendar, catalysts, insiders, documents };
}
