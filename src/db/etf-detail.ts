import type pg from "pg";
import type { Dividend, EtfHolding } from "../data-providers/eodhd/client";
import { canDisplay } from "../data/sources-registry";
import { getPool } from "./pool";

type Query = Pick<pg.Pool, "query">;
type Raw = Record<string, unknown>;

/** Holdings rows stored per listing. Larger bond funds list thousands; the rest stay out of the table. */
export const MAX_STORED_HOLDINGS = 2000;
export const EXPOSURE_KINDS = ["region", "sector", "mcap", "asset", "credit"] as const;
export type ExposureKind = (typeof EXPOSURE_KINDS)[number];

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const nonzeroReturn = (value: unknown): number | null => {
  const parsed = num(value);
  return parsed === 0 ? null : parsed;
};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const isoDate = (value: unknown): string | null => {
  const raw = text(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw > "1900-01-01" ? raw : null;
};
const obj = (value: unknown): Raw | null => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : null;

export interface ParsedHolding { position: number; key: string; symbol: string | null; exchange: string | null; name: string | null; weightPct: number | null; sector: string | null; industry: string | null; country: string | null; region: string | null }
export interface ParsedExposure { kind: ExposureKind; label: string; weightPct: number }
export interface ParsedEtfData {
  isin: string | null; tradingCurrency: string | null; type: string | null;
  category: string | null; openFigi: string | null; indexName: string | null;
  averageMktCapMil: number | null; annualHoldingsTurnover: number | null;
  totalAssetsCurrency: string; terAmbiguous: boolean;
  effectiveDuration: number | null; modifiedDuration: number | null; yieldToMaturity: number | null;
  coupon: number | null; effectiveMaturity: number | null;
  week52High: number | null; week52Low: number | null; beta: number | null;
  totalAssets: number | null; yieldPct: number | null; dividendFrequency: string | null; inceptionDate: string | null;
  ongoingChargePct: number | null; netExpenseRatioPct: number | null;
  retYtdPct: number | null; ret1yPct: number | null; ret3yPct: number | null; ret5yPct: number | null; ret10yPct: number | null;
  vol1yPct: number | null; vol3yPct: number | null; sharpe3y: number | null;
  holdingsCount: number | null; holdingsListed: number; holdings: ParsedHolding[]; exposure: ParsedExposure[];
  /** Complete response, including General, Technicals and all holdings. */
  payload: Raw;
}

/** A weight map whose values are numbers or `{ "<field>_%": n }` objects. All-zero maps are vendor gaps, not data. */
function weights(kind: ExposureKind, map: unknown, field: string | null): ParsedExposure[] {
  const source = obj(map);
  if (!source) return [];
  const rows = Object.entries(source).map(([label, value]) => ({ kind, label: label.trim(), weightPct: field ? num(obj(value)?.[field]) : num(value) }))
    .filter((row): row is ParsedExposure => !!row.label && row.weightPct !== null);
  return rows.some((row) => row.weightPct !== 0) ? rows : [];
}

/** Asset allocation uses Net_Assets_%; the vendor reports US and non-US stock separately. */
function assetAllocation(map: unknown): ParsedExposure[] {
  return weights("asset", Object.fromEntries(Object.entries(obj(map) ?? {}).map(([label, value]) => [label, obj(value)?.["Net_Assets_%"] ?? null])), null);
}

/** Credit quality appears only in some bond funds; no live response with this block was observed. UNVERIFIED shape. */
function creditQuality(etf: Raw): ParsedExposure[] {
  const block = obj(etf.Credit_Quality) ?? obj(etf.Bond_Credit_Quality) ?? obj(obj(etf.Fixed_Income)?.Credit_Quality);
  return block ? weights("credit", block, null).concat(weights("credit", block, "Fund_%")) : [];
}

function holdings(etf: Raw): { rows: ParsedHolding[]; listed: number } {
  const full = obj(etf.Holdings), top = obj(etf.Top_10_Holdings);
  const map = full && Object.keys(full).length >= Object.keys(top ?? {}).length ? full : top ?? {};
  const rows = Object.entries(map).map(([key, value]) => {
    const item = (obj(value) ?? {}) as EtfHolding & Raw;
    return { key, symbol: text(item.Code), exchange: text(item.Exchange), name: text(item.Name), weightPct: num(item["Assets_%"]),
      sector: text(item.Sector), industry: text(item.Industry), country: text(item.Country), region: text(item.Region) };
  });
  rows.sort((a, b) => (b.weightPct ?? -1) - (a.weightPct ?? -1) || a.key.localeCompare(b.key));
  return { rows: rows.slice(0, MAX_STORED_HOLDINGS).map((row, index) => ({ position: index + 1, ...row })), listed: rows.length };
}

/** Converts a fraction expense ratio to percent only when it is unambiguous (below 1%). */
function expenseRatioPct(value: unknown): number | null {
  const ratio = num(value);
  return ratio !== null && ratio >= 0 && ratio < 0.01 ? ratio * 100 : null;
}
const fundPercent = (value: unknown): number | null => num(obj(value)?.["Fund_%"]);
const validCurrency = (value: unknown): string | null => {
  const currency = text(value)?.toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
};

/** Maps a `General,ETF_Data` fundamentals response. Missing vendor fields stay null and never become zero. */
export function parseEtfData(response: unknown): ParsedEtfData | null {
  const root = obj(response);
  const etf = obj(root?.ETF_Data);
  if (!root || !etf) return null;
  const general = obj(root.General) ?? {};
  const technicals = obj(root.Technicals) ?? {};
  const performance = obj(etf.Performance) ?? {};
  const fixedIncome = obj(etf.Fixed_Income) ?? {};
  const { rows, listed } = holdings(etf);
  const count = num(etf.Holdings_Count);
  const ongoing = num(etf.Ongoing_Charge);
  const payload = root;
  const isin = [etf.ISIN, general.ISIN].map(text).find((value) => value && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) ?? null;
  const currency = validCurrency(general.CurrencyCode);
  // TotalAssets is USD only for a USD listing on the US venue. Other listings
  // remain unknown unless the response explicitly names the asset currency.
  const explicitAssetsCurrency = validCurrency(etf.TotalAssetsCurrency) ?? validCurrency(etf.Total_Assets_Currency);
  const assetsCurrency = explicitAssetsCurrency ?? (currency === "USD" && text(general.Exchange)?.toUpperCase() === "US" ? "USD" : "unknown");
  const rawRatio = num(etf.NetExpenseRatio);
  return {
    isin, tradingCurrency: currency, type: text(general.Type),
    category: text(general.Category), openFigi: text(general.OpenFigi), indexName: text(etf.Index_Name),
    averageMktCapMil: num(etf.Average_Mkt_Cap_Mil), annualHoldingsTurnover: num(etf.AnnualHoldingsTurnover),
    totalAssetsCurrency: assetsCurrency, terAmbiguous: rawRatio !== null && rawRatio >= 0.01 && rawRatio <= 0.025,
    effectiveDuration: fundPercent(fixedIncome.EffectiveDuration), modifiedDuration: fundPercent(fixedIncome.ModifiedDuration),
    yieldToMaturity: fundPercent(fixedIncome.YieldToMaturity), coupon: fundPercent(fixedIncome.Coupon),
    effectiveMaturity: fundPercent(fixedIncome.EffectiveMaturity),
    week52High: num(technicals["52WeekHigh"]), week52Low: num(technicals["52WeekLow"]),
    beta: (() => { const value = num(technicals.Beta); return value === 0 ? null : value; })(),
    totalAssets: (() => { const value = num(etf.TotalAssets); return value !== null && value > 0 ? value : null; })(),
    // Yield is a percent in the SPY.US response (1 for about 1%). IWDA.AS returned null.
    yieldPct: (() => { const value = num(etf.Yield); return value !== null && value >= 0 && value <= 100 ? value : null; })(),
    dividendFrequency: text(etf.Dividend_Paying_Frequency), inceptionDate: isoDate(etf.Inception_Date),
    // IWDA.AS reported Max_Annual_Mgmt_Charge=0 and Ongoing_Charge=0.1974; a zero ongoing charge is treated as missing.
    ongoingChargePct: ongoing !== null && ongoing > 0 && ongoing <= 10 ? ongoing : null,
    netExpenseRatioPct: expenseRatioPct(etf.NetExpenseRatio),
    retYtdPct: num(performance.Returns_YTD), ret1yPct: num(performance.Returns_1Y), ret3yPct: nonzeroReturn(performance.Returns_3Y),
    ret5yPct: nonzeroReturn(performance.Returns_5Y), ret10yPct: nonzeroReturn(performance.Returns_10Y),
    vol1yPct: num(performance["1y_Volatility"]), vol3yPct: num(performance["3y_Volatility"]), sharpe3y: num(performance["3y_SharpRatio"]),
    holdingsCount: count !== null && Number.isInteger(count) && count >= 0 ? count : null, holdingsListed: listed, holdings: rows,
    exposure: [
      ...weights("region", etf.World_Regions, "Equity_%"), ...weights("sector", etf.Sector_Weights, "Equity_%"),
      ...weights("mcap", etf.Market_Capitalisation, null), ...assetAllocation(etf.Asset_Allocation), ...creditQuality(etf),
    ],
    payload,
  };
}

export interface StoreEtfDetailInput { listingKey: string; vendorSymbol: string; asOf: string; origin: "job" | "enrich"; data: ParsedEtfData; ucitsHint?: boolean | null }

/** Writes one listing's stats row and replaces its holdings and exposure snapshot in one transaction. */
export async function storeEtfDetail(db: Pick<pg.Pool, "connect">, input: StoreEtfDetailInput): Promise<{ holdings: number; exposure: number }> {
  const { listingKey, vendorSymbol, asOf, origin, data, ucitsHint = null } = input;
  const assetsCurrency = data.totalAssetsCurrency !== "unknown" ? data.totalAssetsCurrency : vendorSymbol.endsWith(".US") && data.tradingCurrency === "USD" ? "USD" : "unknown";
  const display = canDisplay("eodhd");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO etf_fund_stats (listing_key,as_of,vendor_symbol,origin,isin,trading_currency,total_assets,total_assets_currency,yield_pct,dividend_frequency,
      inception_date,ongoing_charge_pct,net_expense_ratio_pct,ret_ytd_pct,ret_1y_pct,ret_3y_pct,ret_5y_pct,ret_10y_pct,vol_1y_pct,vol_3y_pct,sharpe_3y,
      holdings_count,holdings_listed,payload,category,open_figi,average_mkt_cap_mil,annual_holdings_turnover,index_name,
      effective_duration,modified_duration,yield_to_maturity,coupon,effective_maturity,week_52_high,week_52_low,beta,ter_ambiguous,ucits_hint,fetched_at,source_id,display_allowed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,now(),'eodhd',$40)
      ON CONFLICT (listing_key,as_of) DO UPDATE SET vendor_symbol=EXCLUDED.vendor_symbol,origin=EXCLUDED.origin,isin=EXCLUDED.isin,
      trading_currency=EXCLUDED.trading_currency,total_assets=EXCLUDED.total_assets,total_assets_currency=EXCLUDED.total_assets_currency,yield_pct=EXCLUDED.yield_pct,dividend_frequency=EXCLUDED.dividend_frequency,
      inception_date=EXCLUDED.inception_date,ongoing_charge_pct=EXCLUDED.ongoing_charge_pct,net_expense_ratio_pct=EXCLUDED.net_expense_ratio_pct,
      ret_ytd_pct=EXCLUDED.ret_ytd_pct,ret_1y_pct=EXCLUDED.ret_1y_pct,ret_3y_pct=EXCLUDED.ret_3y_pct,ret_5y_pct=EXCLUDED.ret_5y_pct,ret_10y_pct=EXCLUDED.ret_10y_pct,
      vol_1y_pct=EXCLUDED.vol_1y_pct,vol_3y_pct=EXCLUDED.vol_3y_pct,sharpe_3y=EXCLUDED.sharpe_3y,holdings_count=EXCLUDED.holdings_count,
      holdings_listed=EXCLUDED.holdings_listed,payload=EXCLUDED.payload,category=EXCLUDED.category,open_figi=EXCLUDED.open_figi,
      average_mkt_cap_mil=EXCLUDED.average_mkt_cap_mil,annual_holdings_turnover=EXCLUDED.annual_holdings_turnover,index_name=EXCLUDED.index_name,
      effective_duration=EXCLUDED.effective_duration,modified_duration=EXCLUDED.modified_duration,yield_to_maturity=EXCLUDED.yield_to_maturity,
      coupon=EXCLUDED.coupon,effective_maturity=EXCLUDED.effective_maturity,week_52_high=EXCLUDED.week_52_high,week_52_low=EXCLUDED.week_52_low,
      beta=EXCLUDED.beta,ter_ambiguous=EXCLUDED.ter_ambiguous,ucits_hint=EXCLUDED.ucits_hint,fetched_at=now(),display_allowed=EXCLUDED.display_allowed`,
    [listingKey, asOf, vendorSymbol, origin, data.isin, data.tradingCurrency, data.totalAssets, assetsCurrency, data.yieldPct, data.dividendFrequency, data.inceptionDate,
      data.ongoingChargePct, data.netExpenseRatioPct, data.retYtdPct, data.ret1yPct, data.ret3yPct, data.ret5yPct, data.ret10yPct,
      data.vol1yPct, data.vol3yPct, data.sharpe3y, data.holdingsCount, data.holdingsListed, JSON.stringify(data.payload),
      data.category, data.openFigi, data.averageMktCapMil, data.annualHoldingsTurnover, data.indexName,
      data.effectiveDuration, data.modifiedDuration, data.yieldToMaturity, data.coupon, data.effectiveMaturity,
      data.week52High, data.week52Low, data.beta, data.terAmbiguous, ucitsHint, display]);
    await client.query("DELETE FROM etf_holdings WHERE listing_key=$1", [listingKey]);
    for (const row of data.holdings) await client.query(`INSERT INTO etf_holdings (listing_key,as_of,position,holding_key,holding_symbol,holding_exchange,name,weight_pct,sector,industry,country,region,source_id,display_allowed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'eodhd',$13)`,
    [listingKey, asOf, row.position, row.key, row.symbol, row.exchange, row.name, row.weightPct, row.sector, row.industry, row.country, row.region, display]);
    await client.query("DELETE FROM etf_exposure WHERE listing_key=$1", [listingKey]);
    for (const row of data.exposure) await client.query(`INSERT INTO etf_exposure (listing_key,as_of,kind,label,weight_pct,source_id,display_allowed)
      VALUES ($1,$2,$3,$4,$5,'eodhd',$6) ON CONFLICT (listing_key,kind,label) DO UPDATE SET weight_pct=EXCLUDED.weight_pct`,
    [listingKey, asOf, row.kind, row.label, row.weightPct, display]);
    await client.query("COMMIT");
    return { holdings: data.holdings.length, exposure: data.exposure.length };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

/** Upserts dividends by ex-date. Rows without a valid ex-date are skipped. */
export async function upsertEtfDividends(db: Query, vendorSymbol: string, rows: Dividend[]): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    const exDate = isoDate(row.date);
    if (!exDate) continue;
    await db.query(`INSERT INTO etf_dividends (vendor_symbol,ex_date,amount,unadjusted_amount,currency,period,declaration_date,record_date,pay_date,source_id,display_allowed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'eodhd',$10)
      ON CONFLICT (vendor_symbol,ex_date) DO UPDATE SET amount=EXCLUDED.amount,unadjusted_amount=EXCLUDED.unadjusted_amount,currency=EXCLUDED.currency,
      period=EXCLUDED.period,declaration_date=EXCLUDED.declaration_date,record_date=EXCLUDED.record_date,pay_date=EXCLUDED.pay_date,display_allowed=EXCLUDED.display_allowed`,
    [vendorSymbol, exDate, num(row.value), num(row.unadjustedValue), text(row.currency), text(row.period), isoDate(row.declarationDate), isoDate(row.recordDate), isoDate(row.paymentDate), canDisplay("eodhd")]);
    saved++;
  }
  return saved;
}

// ---------- tracking ----------

export interface EtfCandidate { listing_key: string; vendor_symbol: string; name: string; currency: string | null; exchange: string; rank: number }

/**
 * Catalog listings to follow: shortlist first, then listings with a pick, then other enriched ETFs by AUM.
 * The vendor symbol comes from the symbol master by ISIN (XETRA, then US), or `<ticker>.US` for US listings.
 */
export async function etfTrackingCandidates(db: Query, limit: number): Promise<EtfCandidate[]> {
  const result = await db.query<EtfCandidate>(`WITH resolved AS (
      SELECT c.listing_key, c.name, c.shortlist, c.shortlist_rank, c.aum_usd_m, c.trading_currency,
        COALESCE(s.vendor_symbol, CASE WHEN c.exchange IN ('NYSEARCA','NASDAQ','NYSE','BATS','AMEX','IEX') AND c.mnemonic ~ '^[A-Z0-9][A-Z0-9.-]{0,11}$' THEN c.mnemonic || '.US' END) AS vendor_symbol,
        s.currency AS symbol_currency,
        EXISTS (SELECT 1 FROM etf_picks p WHERE p.listing_key=c.listing_key OR (c.isin IS NOT NULL AND p.isin=c.isin)) AS picked
      FROM etf_catalog c
      LEFT JOIN LATERAL (SELECT vendor_symbol, currency FROM symbols WHERE c.isin IS NOT NULL AND isin=c.isin AND NOT delisted
        ORDER BY CASE WHEN exchange='XETRA' THEN 0 WHEN exchange='US' THEN 1 ELSE 2 END, vendor_symbol LIMIT 1) s ON true
      WHERE c.instrument_type IN ('ETF','ACTIVE_ETF') AND c.last_seen >= CURRENT_DATE - 30
        AND (c.shortlist OR c.enrichment_status='ok' OR EXISTS (SELECT 1 FROM etf_picks p WHERE p.listing_key=c.listing_key)))
    SELECT DISTINCT ON (vendor_symbol) listing_key, vendor_symbol, name, COALESCE(symbol_currency, trading_currency) AS currency,
      split_part(vendor_symbol, '.', 2) AS exchange,
      (row_number() OVER (ORDER BY shortlist DESC, shortlist_rank NULLS LAST, picked DESC, aum_usd_m DESC NULLS LAST, listing_key))::int AS rank
    FROM resolved WHERE vendor_symbol IS NOT NULL
    ORDER BY vendor_symbol, shortlist DESC, shortlist_rank NULLS LAST, picked DESC, aum_usd_m DESC NULLS LAST, listing_key`, []);
  return result.rows.sort((a, b) => a.rank - b.rank).slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Adds candidates to tracked_assets (class etf) and etf_tracked, and deactivates listings no longer selected. */
export async function syncEtfTracking(db: Query, candidates: EtfCandidate[]): Promise<{ active: number; deactivated: number }> {
  for (const row of candidates) {
    await db.query(`INSERT INTO tracked_assets (vendor_symbol,asset_class,name,currency,exchange,enabled,sort) VALUES ($1,'etf',$2,$3,$4,true,$5)
      ON CONFLICT (vendor_symbol) DO UPDATE SET name=EXCLUDED.name,currency=COALESCE(EXCLUDED.currency,tracked_assets.currency),enabled=true,sort=EXCLUDED.sort
      WHERE tracked_assets.asset_class='etf'`, [row.vendor_symbol, row.name, row.currency, row.exchange, row.rank]);
    await db.query(`INSERT INTO etf_tracked (listing_key,vendor_symbol,rank,active) SELECT $1,$2,$3,true
      WHERE EXISTS (SELECT 1 FROM tracked_assets WHERE vendor_symbol=$2 AND asset_class='etf')
      ON CONFLICT (listing_key) DO UPDATE SET vendor_symbol=EXCLUDED.vendor_symbol,rank=EXCLUDED.rank,active=true`, [row.listing_key, row.vendor_symbol, row.rank]);
  }
  const keys = candidates.map((row) => row.listing_key);
  const dropped = await db.query(`UPDATE etf_tracked SET active=false WHERE active AND NOT (listing_key = ANY($1::text[])) RETURNING vendor_symbol`, [keys]);
  await db.query(`UPDATE tracked_assets a SET enabled=false WHERE asset_class='etf' AND enabled
    AND NOT EXISTS (SELECT 1 FROM etf_tracked t WHERE t.vendor_symbol=a.vendor_symbol AND t.active)`, []);
  return { active: candidates.length, deactivated: dropped.rowCount ?? 0 };
}

export interface DueEtf { listing_key: string; vendor_symbol: string; isin: string | null; currency: string | null; detail_fresh: boolean; last_bar_date: string | null; last_dividend_date: string | null }

/**
 * Active listings whose detail is at least seven days old, stalest first. A stats row written by the
 * enrich run within six days counts as fresh, so the job skips that fundamentals request.
 */
export async function dueEtfs(db: Query, limit: number): Promise<DueEtf[]> {
  const result = await db.query<DueEtf>(`SELECT t.listing_key, t.vendor_symbol, c.isin, a.currency,
      EXISTS (SELECT 1 FROM etf_fund_stats f WHERE f.listing_key=t.listing_key AND f.vendor_symbol=t.vendor_symbol AND f.fetched_at > now() - interval '6 days') AS detail_fresh,
      (SELECT max(bar_date)::text FROM asset_bars b WHERE b.vendor_symbol=t.vendor_symbol) AS last_bar_date,
      (SELECT max(ex_date)::text FROM etf_dividends d WHERE d.vendor_symbol=t.vendor_symbol) AS last_dividend_date
    FROM etf_tracked t JOIN etf_catalog c USING (listing_key) JOIN tracked_assets a ON a.vendor_symbol=t.vendor_symbol
    WHERE t.active AND (t.detail_fetched_at IS NULL OR t.detail_fetched_at < now() - interval '7 days')
    ORDER BY t.detail_fetched_at NULLS FIRST, t.rank LIMIT $1`, [limit]);
  return result.rows;
}

export async function countActiveEtfs(db: Query): Promise<number> {
  const result = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM etf_tracked WHERE active", []);
  return Number(result.rows[0]?.n ?? 0);
}

export async function markEtfFetched(db: Query, listingKey: string, status: "ok" | "not_etf" | "isin_mismatch" | "failed", parts: { dividends: boolean; bars: boolean }): Promise<void> {
  await db.query(`UPDATE etf_tracked SET detail_fetched_at=now(),detail_status=$2,
    dividends_fetched_at=CASE WHEN $3 THEN now() ELSE dividends_fetched_at END,
    bars_fetched_at=CASE WHEN $4 THEN now() ELSE bars_fetched_at END WHERE listing_key=$1`, [listingKey, status, parts.dividends, parts.bars]);
}

// ---------- read models (owner-only pages) ----------

export interface EtfStats {
  asOf: string; vendorSymbol: string; origin: "job" | "enrich"; isin: string | null; tradingCurrency: string | null; totalAssets: number | null; totalAssetsCurrency: string | null;
  yieldPct: number | null; dividendFrequency: string | null; inceptionDate: string | null; ongoingChargePct: number | null; netExpenseRatioPct: number | null;
  retYtdPct: number | null; ret1yPct: number | null; ret3yPct: number | null; ret5yPct: number | null; ret10yPct: number | null;
  vol1yPct: number | null; vol3yPct: number | null; sharpe3y: number | null; holdingsCount: number | null; holdingsListed: number | null; fetchedAt: string;
}
export interface EtfHoldingRow { position: number; symbol: string | null; exchange: string | null; name: string | null; weightPct: number | null; sector: string | null; country: string | null }
export interface EtfDividendRow { exDate: string; amount: number | null; currency: string | null; period: string | null; payDate: string | null }
export interface EtfBar { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface EtfDetailView { stats: EtfStats | null; vendorSymbol: string | null; currency: string | null; holdings: EtfHoldingRow[]; exposure: Record<ExposureKind, { label: string; weightPct: number }[]>; dividends: EtfDividendRow[]; bars: EtfBar[] }

const n = (value: unknown): number | null => value === null || value === undefined || value === "" ? null : Number(value);
const day = (value: unknown): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
type StatsRow = Record<string, unknown>;
export function mapStats(row: StatsRow): EtfStats {
  return {
    asOf: day(row.as_of) ?? "", vendorSymbol: String(row.vendor_symbol), origin: row.origin === "enrich" ? "enrich" : "job", isin: (row.isin as string | null) ?? null,
    tradingCurrency: (row.trading_currency as string | null) ?? null, totalAssets: n(row.total_assets), totalAssetsCurrency: (row.total_assets_currency as string | null) ?? null,
    yieldPct: n(row.yield_pct), dividendFrequency: (row.dividend_frequency as string | null) ?? null, inceptionDate: day(row.inception_date),
    ongoingChargePct: n(row.ongoing_charge_pct), netExpenseRatioPct: n(row.net_expense_ratio_pct),
    retYtdPct: n(row.ret_ytd_pct), ret1yPct: n(row.ret_1y_pct), ret3yPct: nonzeroReturn(row.ret_3y_pct), ret5yPct: nonzeroReturn(row.ret_5y_pct), ret10yPct: nonzeroReturn(row.ret_10y_pct),
    vol1yPct: n(row.vol_1y_pct), vol3yPct: n(row.vol_3y_pct), sharpe3y: n(row.sharpe_3y), holdingsCount: n(row.holdings_count), holdingsListed: n(row.holdings_listed),
    fetchedAt: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : String(row.fetched_at ?? ""),
  };
}
const STATS_COLUMNS = `as_of,vendor_symbol,origin,isin,trading_currency,total_assets,total_assets_currency,yield_pct,dividend_frequency,inception_date,
  ongoing_charge_pct,net_expense_ratio_pct,ret_ytd_pct,ret_1y_pct,ret_3y_pct,ret_5y_pct,ret_10y_pct,vol_1y_pct,vol_3y_pct,sharpe_3y,holdings_count,holdings_listed,fetched_at`;
const emptyExposure = (): EtfDetailView["exposure"] => ({ region: [], sector: [], mcap: [], asset: [], credit: [] });

/** Bounded reads for one listing: latest stats, up to `holdingsLimit` holdings, the exposure snapshot, 40 dividends and `barDays` bars. */
export async function etfDetailView(listingKey: string, options: { holdingsLimit?: number; barDays?: number } = {}, db: Query | null = getPool()): Promise<EtfDetailView> {
  const view: EtfDetailView = { stats: null, vendorSymbol: null, currency: null, holdings: [], exposure: emptyExposure(), dividends: [], bars: [] };
  if (!db) return view;
  const holdingsLimit = Math.min(Math.max(options.holdingsLimit ?? 100, 1), MAX_STORED_HOLDINGS);
  const barDays = Math.min(Math.max(options.barDays ?? 400, 1), 2000);
  const [stats, tracked, holdingsRows, exposureRows] = await Promise.all([
    db.query(`SELECT ${STATS_COLUMNS} FROM etf_fund_stats WHERE listing_key=$1 ORDER BY as_of DESC LIMIT 1`, [listingKey]),
    db.query<{ vendor_symbol: string; currency: string | null }>(`SELECT t.vendor_symbol, a.currency FROM etf_tracked t JOIN tracked_assets a USING (vendor_symbol) WHERE t.listing_key=$1`, [listingKey]),
    db.query(`SELECT position,holding_symbol,holding_exchange,name,weight_pct,sector,country FROM etf_holdings WHERE listing_key=$1 ORDER BY position LIMIT $2`, [listingKey, holdingsLimit]),
    db.query(`SELECT kind,label,weight_pct FROM etf_exposure WHERE listing_key=$1 ORDER BY kind, weight_pct DESC, label LIMIT 200`, [listingKey]),
  ]);
  view.stats = stats.rows[0] ? mapStats(stats.rows[0]) : null;
  view.vendorSymbol = tracked.rows[0]?.vendor_symbol ?? view.stats?.vendorSymbol ?? null;
  view.currency = tracked.rows[0]?.currency ?? view.stats?.tradingCurrency ?? null;
  view.holdings = holdingsRows.rows.map((row) => ({ position: Number(row.position), symbol: row.holding_symbol ?? null, exchange: row.holding_exchange ?? null, name: row.name ?? null, weightPct: n(row.weight_pct), sector: row.sector ?? null, country: row.country ?? null }));
  for (const row of exposureRows.rows) if ((EXPOSURE_KINDS as readonly string[]).includes(row.kind)) view.exposure[row.kind as ExposureKind].push({ label: String(row.label), weightPct: Number(row.weight_pct) });
  if (view.vendorSymbol) {
    const [dividends, bars] = await Promise.all([
      db.query(`SELECT ex_date,amount,currency,period,pay_date FROM etf_dividends WHERE vendor_symbol=$1 ORDER BY ex_date DESC LIMIT 40`, [view.vendorSymbol]),
      db.query(`SELECT bar_date,open,high,low,close,volume FROM (SELECT * FROM asset_bars WHERE vendor_symbol=$1 ORDER BY bar_date DESC LIMIT $2) recent ORDER BY bar_date`, [view.vendorSymbol, barDays]),
    ]);
    view.dividends = dividends.rows.map((row) => ({ exDate: day(row.ex_date) ?? "", amount: n(row.amount), currency: row.currency ?? null, period: row.period ?? null, payDate: day(row.pay_date) }));
    view.bars = bars.rows.map((row) => {
      const close = Number(row.close);
      return { date: day(row.bar_date) ?? "", open: n(row.open) ?? close, high: n(row.high) ?? close, low: n(row.low) ?? close, close, volume: n(row.volume) ?? 0 };
    });
  }
  return view;
}

export interface EtfListStats { yieldPct: number | null; ret1yPct: number | null; asOf: string }

/** Latest yield and 1-year return for up to 100 listings, for the catalog page. */
export async function etfListStats(listingKeys: string[], db: Query | null = getPool()): Promise<Map<string, EtfListStats>> {
  const out = new Map<string, EtfListStats>();
  const keys = [...new Set(listingKeys)].slice(0, 100);
  if (!db || !keys.length) return out;
  const result = await db.query(`SELECT DISTINCT ON (listing_key) listing_key, yield_pct, ret_1y_pct, as_of FROM etf_fund_stats
    WHERE listing_key = ANY($1::text[]) ORDER BY listing_key, as_of DESC`, [keys]);
  for (const row of result.rows) out.set(String(row.listing_key), { yieldPct: n(row.yield_pct), ret1yPct: n(row.ret_1y_pct), asOf: day(row.as_of) ?? "" });
  return out;
}
