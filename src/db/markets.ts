import type pg from "pg";
import type { OHLCV } from "@/engine";
import { canDisplay } from "@/data/sources-registry";
import type { AssetClass } from "./asset-bars";
import { getPool } from "./pool";

type Query = Pick<pg.Pool, "query">;
const num = (value: string | number | null | undefined): number | null => value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;

/** Vendor suffix per asset class; routes use the bare code (GSPC, EURUSD, BTC-USD). */
type MarketClass = Exclude<AssetClass, "etf">;
export const SUFFIX: Record<MarketClass, string> = { index: "INDX", fx: "FOREX", crypto: "CC" };
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,19}$/;
/** The vendor symbol for a route code, or null when the code is not a plain market code. */
export function vendorSymbolFor(assetClass: MarketClass, code: string): string | null {
  const upper = decodeURIComponent(code).toUpperCase();
  return CODE_PATTERN.test(upper) ? `${upper}.${SUFFIX[assetClass]}` : null;
}
export const codeOf = (vendorSymbol: string): string => vendorSymbol.replace(/\.[A-Z]+$/, "");

export interface AssetSummary {
  symbol: string; code: string; name: string; currency: string | null; assetClass: AssetClass;
  lastDate: string | null; last: number | null; change1d: number | null; change5d: number | null; changeYtd: number | null;
  spark: number[]; sparkFirst: string | null;
}

/** Changes as ratios from ascending closes. YTD uses the last close before the latest bar's year. */
export function summarize(closes: number[], ytdBase: number | null) {
  const last = closes.at(-1) ?? null;
  const back = (n: number) => closes.length > n ? closes[closes.length - 1 - n] : null;
  const ratio = (from: number | null) => last !== null && from !== null && from !== 0 ? last / from - 1 : null;
  return { last, change1d: ratio(back(1)), change5d: ratio(back(5)), changeYtd: ratio(ytdBase) };
}

type SummaryRow = { vendor_symbol: string; name: string; currency: string | null; asset_class: AssetClass; dates: string[] | null; closes: (string | number)[] | null; ytd_base: string | number | null };
const SUMMARY_SQL = `SELECT a.vendor_symbol,a.name,a.currency,a.asset_class,r.dates,r.closes,y.close AS ytd_base
  FROM tracked_assets a
  LEFT JOIN LATERAL (SELECT array_agg(t.bar_date::text ORDER BY t.bar_date) AS dates,array_agg(t.close ORDER BY t.bar_date) AS closes
    FROM (SELECT bar_date,close FROM asset_bars WHERE vendor_symbol=a.vendor_symbol ORDER BY bar_date DESC LIMIT 30) t) r ON true
  LEFT JOIN LATERAL (SELECT b.close FROM asset_bars b WHERE b.vendor_symbol=a.vendor_symbol
    AND b.bar_date < date_trunc('year',(SELECT max(bar_date) FROM asset_bars WHERE vendor_symbol=a.vendor_symbol))::date
    ORDER BY b.bar_date DESC LIMIT 1) y ON true
  WHERE a.enabled AND a.asset_class=$1 AND ($2::text IS NULL OR a.vendor_symbol=$2)
  ORDER BY a.sort,a.vendor_symbol LIMIT 100`;

function mapSummary(row: SummaryRow): AssetSummary {
  const closes = (row.closes ?? []).map(Number);
  const dates = row.dates ?? [];
  return {
    symbol: row.vendor_symbol, code: codeOf(row.vendor_symbol), name: row.name, currency: row.currency, assetClass: row.asset_class,
    lastDate: dates.at(-1) ?? null, ...summarize(closes, num(row.ytd_base)), spark: closes, sparkFirst: dates[0] ?? null,
  };
}

/** Stored summaries for one asset class: at most 100 assets and 30 closes each. Empty without a database. */
export async function assetSummaries(assetClass: AssetClass, db: Query | null = getPool()): Promise<AssetSummary[]> {
  if (!db) return [];
  return (await db.query<SummaryRow>(SUMMARY_SQL, [assetClass, null])).rows.map(mapSummary);
}

export interface AssetDetail { summary: AssetSummary; bars: OHLCV[]; high52: number | null; low52: number | null }

/** One tracked asset with up to 400 daily bars, or null when it is not tracked. */
export async function assetDetail(assetClass: AssetClass, vendorSymbol: string, db: Query | null = getPool()): Promise<AssetDetail | null> {
  if (!db) return null;
  const found = (await db.query<SummaryRow>(SUMMARY_SQL, [assetClass, vendorSymbol])).rows[0];
  if (!found) return null;
  const rows = (await db.query<{ bar_date: string; open: string | null; high: string | null; low: string | null; close: string; volume: string | null }>(
    `SELECT bar_date::text AS bar_date,open,high,low,close,volume FROM (SELECT * FROM asset_bars WHERE vendor_symbol=$1 ORDER BY bar_date DESC LIMIT 400) t ORDER BY bar_date`,
    [vendorSymbol])).rows;
  const bars: OHLCV[] = rows.map((row) => {
    const close = Number(row.close);
    return { date: row.bar_date, open: num(row.open) ?? close, high: num(row.high) ?? close, low: num(row.low) ?? close, close, volume: num(row.volume) ?? 0 };
  });
  const year = bars.slice(-252);
  return {
    summary: mapSummary(found), bars,
    high52: year.length ? Math.max(...year.map((bar) => bar.high)) : null,
    low52: year.length ? Math.min(...year.map((bar) => bar.low)) : null,
  };
}

export interface IndexComponent { code: string; exchange: string | null; name: string | null; sector: string | null; industry: string | null; weight: number | null }

/** The latest stored constituent list for an index, heaviest first (at most 600 rows). */
export async function indexComponents(vendorSymbol: string, db: Query | null = getPool()): Promise<{ asOf: string | null; rows: IndexComponent[] }> {
  if (!db) return { asOf: null, rows: [] };
  const result = await db.query<{ as_of: string; code: string; exchange: string | null; name: string | null; sector: string | null; industry: string | null; weight: string | null }>(
    `SELECT as_of::text AS as_of,code,exchange,name,sector,industry,weight FROM index_components
     WHERE index_symbol=$1 AND as_of=(SELECT max(as_of) FROM index_components WHERE index_symbol=$1)
     ORDER BY weight DESC NULLS LAST,code LIMIT 600`, [vendorSymbol]);
  return { asOf: result.rows[0]?.as_of ?? null, rows: result.rows.map((row) => ({ code: row.code, exchange: row.exchange, name: row.name, sector: row.sector, industry: row.industry, weight: num(row.weight) })) };
}

/** Vendor `Components` entries keyed "0", "1", ... Rows without a code are dropped; a missing weight stays null. */
export function parseComponents(payload: unknown): IndexComponent[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const seen = new Set<string>();
  const out: IndexComponent[] = [];
  for (const entry of Object.values(payload as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const code = text(item.Code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const weight = typeof item.Weight === "number" && Number.isFinite(item.Weight) && item.Weight >= 0 ? item.Weight : null;
    out.push({ code, exchange: text(item.Exchange), name: text(item.Name), sector: text(item.Sector), industry: text(item.Industry), weight });
  }
  return out;
}

/** Index assets whose constituents were never attempted or were last attempted before `staleBefore` (ISO date). */
export async function componentsDue(db: Query, staleBefore: string, only?: string[]): Promise<string[]> {
  const result = await db.query<{ vendor_symbol: string }>(`SELECT a.vendor_symbol FROM tracked_assets a
    LEFT JOIN index_component_refresh r ON r.index_symbol=a.vendor_symbol
    WHERE a.enabled AND a.asset_class='index' AND (r.attempted_at IS NULL OR r.attempted_at < $1::date)
      AND ($2::text[] IS NULL OR a.vendor_symbol=ANY($2::text[]))
    ORDER BY a.sort,a.vendor_symbol`, [staleBefore, only ?? null]);
  return result.rows.map((row) => row.vendor_symbol);
}

/** Replace one day's constituent list and record the attempt. Idempotent for the same day. */
export async function saveComponents(db: Query, indexSymbol: string, asOf: string, rows: IndexComponent[] | null): Promise<number> {
  const status = rows === null ? "failed" : rows.length ? "ok" : "empty";
  if (rows?.length) {
    // One upsert statement, then drop codes that left the list, so a reader never sees a half-written day.
    await db.query(`INSERT INTO index_components (index_symbol,as_of,code,exchange,name,sector,industry,weight,source_id,display_allowed)
      SELECT $1::text,$2::date,t.code,t.exchange,t.name,t.sector,t.industry,t.weight,'eodhd',$9::boolean
      FROM unnest($3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::numeric[]) AS t(code,exchange,name,sector,industry,weight)
      ON CONFLICT (index_symbol,as_of,code) DO UPDATE SET exchange=EXCLUDED.exchange,name=EXCLUDED.name,sector=EXCLUDED.sector,
        industry=EXCLUDED.industry,weight=EXCLUDED.weight,display_allowed=EXCLUDED.display_allowed`,
    [indexSymbol, asOf, rows.map((row) => row.code), rows.map((row) => row.exchange), rows.map((row) => row.name), rows.map((row) => row.sector),
      rows.map((row) => row.industry), rows.map((row) => row.weight), canDisplay("eodhd")]);
    await db.query("DELETE FROM index_components WHERE index_symbol=$1 AND as_of=$2 AND NOT (code=ANY($3::text[]))", [indexSymbol, asOf, rows.map((row) => row.code)]);
  }
  await db.query(`INSERT INTO index_component_refresh (index_symbol,attempted_at,row_count,status) VALUES ($1,now(),$2,$3)
    ON CONFLICT (index_symbol) DO UPDATE SET attempted_at=EXCLUDED.attempted_at,row_count=EXCLUDED.row_count,status=EXCLUDED.status`,
  [indexSymbol, rows?.length ?? 0, status]);
  return rows?.length ?? 0;
}

export interface CrossCell { value: number | null; derived: boolean }

/**
 * Cross rates from stored pair closes: one unit of the row currency in the column currency.
 * A direct or inverted pair wins; otherwise the rate goes through USD when both legs are stored.
 */
export function crossMatrix(pairs: { code: string; last: number | null }[], currencies: string[]): CrossCell[][] {
  const direct = new Map<string, number>();
  for (const pair of pairs) {
    if (!/^[A-Z]{6}$/.test(pair.code) || pair.last === null || !(pair.last > 0)) continue;
    const [base, quote] = [pair.code.slice(0, 3), pair.code.slice(3)];
    direct.set(`${base}${quote}`, pair.last);
    if (!direct.has(`${quote}${base}`)) direct.set(`${quote}${base}`, 1 / pair.last);
  }
  const rate = (from: string, to: string): CrossCell => {
    if (from === to) return { value: 1, derived: false };
    const found = direct.get(`${from}${to}`);
    if (found !== undefined) return { value: found, derived: false };
    const a = from === "USD" ? 1 : direct.get(`${from}USD`);
    const b = to === "USD" ? 1 : direct.get(`USD${to}`);
    return a !== undefined && b !== undefined ? { value: a * b, derived: true } : { value: null, derived: false };
  };
  return currencies.map((from) => currencies.map((to) => rate(from, to)));
}
