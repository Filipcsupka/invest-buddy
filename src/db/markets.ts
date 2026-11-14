import type pg from "pg";
import type { OHLCV } from "@/engine";
import { canDisplay } from "@/data/sources-registry";
import type { AssetClass } from "./asset-bars";
import { getPool } from "./pool";
import { pageScoreRow, scoringMember } from "./universe";
import { REVENUE_CONCEPTS } from "../engine/revenue-concepts";
import { indexAnalytics, isVolatilityIndex, toRatingInputs, type ComponentFacts, type GrowthFact, type IndexAnalytics, type IndexBar, type PeerSeries } from "../markets/index-analytics";
import type { IndexRatingInputs } from "../markets/index-types";

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

/** Constituent rows an index page renders, heaviest first; the page states the full count when it shows fewer. */
export const INDEX_COMPONENTS_SHOWN = 600;

/** The latest stored constituent list for an index, heaviest first (at most INDEX_COMPONENTS_SHOWN rows). */
export async function indexComponents(vendorSymbol: string, db: Query | null = getPool()): Promise<{ asOf: string | null; rows: IndexComponent[] }> {
  if (!db) return { asOf: null, rows: [] };
  const result = await db.query<{ as_of: string; code: string; exchange: string | null; name: string | null; sector: string | null; industry: string | null; weight: string | null }>(
    `SELECT as_of::text AS as_of,code,exchange,name,sector,industry,weight FROM index_components
     WHERE index_symbol=$1 AND as_of=(SELECT max(as_of) FROM index_components WHERE index_symbol=$1)
     ORDER BY weight DESC NULLS LAST,code LIMIT $2`, [vendorSymbol, INDEX_COMPONENTS_SHOWN]);
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

// ---- Index snapshots (General + Components) and the index rating read model ----

/** Complete vendor `General` block plus the fields used for lookup. */
export interface IndexGeneral { name: string | null; currency: string | null; country: string | null; raw: Record<string, unknown> }

export function parseIndexGeneral(payload: unknown): IndexGeneral | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  if (!Object.keys(raw).length) return null;
  const text = (key: string) => typeof raw[key] === "string" && raw[key].trim() ? raw[key].trim() : null;
  return { name: text("Name"), currency: text("CurrencyCode"), country: text("CountryName") ?? text("CountryISO"), raw };
}

/** A fundamentals response for `filter=General,Components`: both blocks when present. A response without either is null. */
export function parseIndexFundamentals(payload: unknown): { general: IndexGeneral | null; components: IndexComponent[] } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as Record<string, unknown>;
  if (!("General" in body) && !("Components" in body)) return null;
  return { general: parseIndexGeneral(body.General), components: parseComponents(body.Components) };
}

/** Index assets whose snapshot was never attempted or was last attempted before `staleBefore` (ISO date). */
export async function indexSnapshotsDue(db: Query, staleBefore: string, only?: string[]): Promise<string[]> {
  const result = await db.query<{ vendor_symbol: string }>(`SELECT a.vendor_symbol FROM tracked_assets a
    LEFT JOIN index_snapshot_refresh r ON r.index_symbol=a.vendor_symbol
    WHERE a.enabled AND a.asset_class='index' AND (r.attempted_at IS NULL OR r.attempted_at < $1::date)
      AND ($2::text[] IS NULL OR a.vendor_symbol=ANY($2::text[]))
    ORDER BY r.attempted_at NULLS FIRST,a.sort,a.vendor_symbol`, [staleBefore, only ?? null]);
  return result.rows.map((row) => row.vendor_symbol);
}

/**
 * Stores one day's snapshot: the constituent list (index_components, through saveComponents) and the `General` block with
 * the list's weight coverage. `null` records a failed attempt only. Idempotent for the same day.
 */
export async function saveIndexSnapshot(db: Query, indexSymbol: string, asOf: string,
  snapshot: { general: IndexGeneral | null; components: IndexComponent[] } | null, requestFilter = "General,Components"): Promise<"ok" | "empty" | "failed"> {
  if (!snapshot) {
    await saveComponents(db, indexSymbol, asOf, null);
    await db.query(`INSERT INTO index_snapshot_refresh (index_symbol,attempted_at,component_count,status) VALUES ($1,now(),0,'failed')
      ON CONFLICT (index_symbol) DO UPDATE SET attempted_at=EXCLUDED.attempted_at,component_count=0,status='failed'`, [indexSymbol]);
    return "failed";
  }
  const rows = snapshot.components;
  await saveComponents(db, indexSymbol, asOf, rows);
  const weighted = rows.filter((row) => row.weight !== null);
  const status = rows.length ? "ok" : "empty";
  if (snapshot.general || rows.length) {
    await db.query(`INSERT INTO index_snapshots (index_symbol,as_of,general,name,currency,country,component_count,weighted_count,weight_sum,request_filter,fetched_at,source_id,display_allowed)
      VALUES ($1,$2::date,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,now(),'eodhd',$11)
      ON CONFLICT (index_symbol,as_of) DO UPDATE SET general=EXCLUDED.general,name=EXCLUDED.name,currency=EXCLUDED.currency,country=EXCLUDED.country,
        component_count=EXCLUDED.component_count,weighted_count=EXCLUDED.weighted_count,weight_sum=EXCLUDED.weight_sum,
        request_filter=EXCLUDED.request_filter,fetched_at=EXCLUDED.fetched_at,display_allowed=EXCLUDED.display_allowed`,
    [indexSymbol, asOf, JSON.stringify(snapshot.general?.raw ?? {}), snapshot.general?.name ?? null, snapshot.general?.currency ?? null, snapshot.general?.country ?? null,
      rows.length, weighted.length, weighted.length ? weighted.reduce((sum, row) => sum + (row.weight as number), 0) : null, requestFilter, canDisplay("eodhd")]);
  }
  await db.query(`INSERT INTO index_snapshot_refresh (index_symbol,attempted_at,component_count,status) VALUES ($1,now(),$2,$3)
    ON CONFLICT (index_symbol) DO UPDATE SET attempted_at=EXCLUDED.attempted_at,component_count=EXCLUDED.component_count,status=EXCLUDED.status`,
  [indexSymbol, rows.length, status]);
  return status;
}

export interface IndexSnapshot {
  asOf: string; name: string | null; currency: string | null; country: string | null; general: Record<string, unknown>;
  componentCount: number; weightedCount: number; weightSum: number | null; fetchedAt: string; sourceId: string; displayAllowed: boolean;
}

/** The latest stored `General` snapshot of an index with its provenance, or null. */
export async function latestIndexSnapshot(vendorSymbol: string, db: Query | null = getPool()): Promise<IndexSnapshot | null> {
  if (!db) return null;
  const row = (await db.query<{ as_of: string; name: string | null; currency: string | null; country: string | null; general: Record<string, unknown>; component_count: number; weighted_count: number; weight_sum: string | null; fetched_at: string; source_id: string; display_allowed: boolean }>(
    `SELECT as_of::text AS as_of,name,currency,country,general,component_count,weighted_count,weight_sum,fetched_at::text AS fetched_at,source_id,display_allowed
     FROM index_snapshots WHERE index_symbol=$1 ORDER BY as_of DESC LIMIT 1`, [vendorSymbol])).rows[0];
  return row ? { asOf: row.as_of, name: row.name, currency: row.currency, country: row.country, general: row.general, componentCount: Number(row.component_count),
    weightedCount: Number(row.weighted_count), weightSum: num(row.weight_sum), fetchedAt: row.fetched_at, sourceId: row.source_id, displayAllowed: row.display_allowed } : null;
}

/** Years of index bars the rating read model loads: MA200, three years of volatility history and the five-year high. */
export const INDEX_RATING_YEARS = 5;

type IndexBarRow = { bar_date: string; close: string; high: string | null; low: string | null };
const mapIndexBar = (row: IndexBarRow): IndexBar => ({ date: row.bar_date, close: Number(row.close), high: num(row.high), low: num(row.low) });

/** Ascending daily bars of one index for the last `years` years before its latest stored bar. */
export async function indexBars(vendorSymbol: string, db: Query | null = getPool(), years = INDEX_RATING_YEARS): Promise<IndexBar[]> {
  if (!db) return [];
  return (await db.query<IndexBarRow>(`SELECT bar_date::text AS bar_date,close,high,low FROM asset_bars
    WHERE vendor_symbol=$1 AND bar_date > (SELECT max(bar_date) FROM asset_bars WHERE vendor_symbol=$1) - make_interval(years => $2::int)
    ORDER BY bar_date`, [vendorSymbol, years])).rows.map(mapIndexBar);
}

/** Last `sessions` closes of every enabled index, for relative strength in local currency. */
export async function indexPeerSeries(db: Query | null = getPool(), sessions = 260): Promise<PeerSeries[]> {
  if (!db) return [];
  const rows = (await db.query<{ vendor_symbol: string; currency: string | null; dates: string[] | null; closes: (string | number)[] | null }>(
    `SELECT a.vendor_symbol,a.currency,r.dates,r.closes FROM tracked_assets a
     LEFT JOIN LATERAL (SELECT array_agg(t.bar_date::text ORDER BY t.bar_date) AS dates,array_agg(t.close ORDER BY t.bar_date) AS closes
       FROM (SELECT bar_date,close FROM asset_bars WHERE vendor_symbol=a.vendor_symbol ORDER BY bar_date DESC LIMIT $1) t) r ON true
     WHERE a.enabled AND a.asset_class='index' ORDER BY a.sort,a.vendor_symbol`, [sessions])).rows;
  return rows.map((row) => ({ symbol: row.vendor_symbol, currency: row.currency,
    bars: (row.dates ?? []).map((date, i) => ({ date, close: Number(row.closes?.[i]) })) }));
}

/**
 * Constituent to instrument join keys, through the security master and never by bare ticker alone: the constituent's
 * vendor symbol (code.exchange) matches instrument_ids.vendor_symbols.eodhd (rank 0); without a stored vendor symbol, it
 * matches a ticker that is the vendor symbol itself, ASML.AS (rank 1), or, on the US exchange only, the bare code (rank 2,
 * keyed as ticker||'.US'). An instrument whose stored vendor symbol differs (SQ trades as XYZ.US) never matches by its
 * ticker. The keys are built once per query and hash-joined to the list on code.exchange, instead of a per-constituent
 * subquery over an OR of computed expressions that no index can serve (IXIC has over 3,000 constituents).
 */
const COMPONENT_KEYS = `SELECT k.key,k.ticker,k.rank FROM instruments i LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL
  CROSS JOIN LATERAL (VALUES (ids.vendor_symbols->>'eodhd',i.ticker,0),
    (CASE WHEN (ids.vendor_symbols->>'eodhd') IS NULL THEN i.ticker END,i.ticker,1),
    (CASE WHEN (ids.vendor_symbols->>'eodhd') IS NULL THEN i.ticker||'.US' END,i.ticker,2)) k(key,ticker,rank)
  WHERE k.key IS NOT NULL`;

type ComponentRow = { code: string; exchange: string | null; name: string | null; sector: string | null; industry: string | null; weight: string | null; ticker: string | null;
  bar_date: string | null; close: string | null; ma50: string | null; ma200: string | null; state: string | null; state_as_of: string | null };

/**
 * Constituent facts for several (index, date) requests in one statement. Each request reads the index's latest list on or
 * before its date. Member bars and rule states are read once per (ticker, date), so a stock that sits in several indices
 * (GSPC, NDX, IXIC, DJI) is not read again for each of them. Built per call: the score row rule follows the environment.
 */
const componentFactsSql = () => `WITH req AS (SELECT DISTINCT r.index_symbol,r.as_of FROM unnest($1::text[],$2::date[]) AS r(index_symbol,as_of)
    ), c AS (
      SELECT r.index_symbol,r.as_of AS req_as_of,c.as_of,c.code,c.exchange,c.name,c.sector,c.industry,c.weight FROM req r
      JOIN index_components c ON c.index_symbol=r.index_symbol
        AND c.as_of=(SELECT max(x.as_of) FROM index_components x WHERE x.index_symbol=r.index_symbol AND x.as_of<=r.as_of)
    ), keys AS (${COMPONENT_KEYS}
    ), m AS (SELECT DISTINCT ON (c.index_symbol,c.req_as_of,c.code) c.*,k.ticker FROM c LEFT JOIN keys k ON c.exchange IS NOT NULL AND k.key=c.code||'.'||c.exchange
      ORDER BY c.index_symbol,c.req_as_of,c.code,k.rank,k.ticker
    ), t AS (SELECT DISTINCT ticker,req_as_of FROM m WHERE ticker IS NOT NULL
    ), f AS (SELECT t.ticker,t.req_as_of,b.bar_date,b.close,b.ma50,b.ma200,s.state,s.as_of AS state_as_of FROM t
      LEFT JOIN LATERAL (SELECT max(x.bar_date)::text AS bar_date,(array_agg(x.close ORDER BY x.bar_date DESC))[1] AS close,
          CASE WHEN count(*) FILTER (WHERE x.rn<=50)=50 THEN avg(x.close) FILTER (WHERE x.rn<=50) END AS ma50,
          CASE WHEN count(*)=200 THEN avg(x.close) END AS ma200
        FROM (SELECT d.bar_date,d.close,row_number() OVER (ORDER BY d.bar_date DESC) AS rn FROM daily_bars d
          WHERE d.ticker=t.ticker AND d.bar_date<=t.req_as_of ORDER BY d.bar_date DESC LIMIT 200) x HAVING count(*)>0) b ON true
      LEFT JOIN LATERAL (SELECT r.state,r.as_of::text AS as_of FROM score_results r
        WHERE r.ticker=t.ticker AND r.as_of<=t.req_as_of AND ${pageScoreRow("r")}
          AND EXISTS (SELECT 1 FROM universe_membership um WHERE um.ticker=r.ticker AND ${scoringMember("um")}
            AND um.valid_from<=r.as_of AND (um.valid_to IS NULL OR um.valid_to>r.as_of))
        ORDER BY r.as_of DESC LIMIT 1) s ON true)
    SELECT m.index_symbol,m.req_as_of::text AS req_as_of,m.as_of::text AS list_as_of,m.code,m.exchange,m.name,m.sector,m.industry,m.weight,m.ticker,
      f.bar_date,f.close,f.ma50,f.ma200,f.state,f.state_as_of
    FROM m LEFT JOIN f ON f.ticker=m.ticker AND f.req_as_of=m.req_as_of
    ORDER BY m.index_symbol,m.req_as_of,m.weight DESC NULLS LAST,m.code`;

export type ComponentFactsList = { asOf: string | null; rows: ComponentFacts[] };
const factsKey = (symbol: string, asOf: string) => `${symbol}|${asOf}`;

/** Constituent facts for many (index, date) requests in one query, keyed `symbol|asOf`. Requests without a list are absent. */
export async function indexComponentFactsBatch(requests: readonly { symbol: string; asOf: string }[], db: Query | null = getPool()): Promise<Map<string, ComponentFactsList>> {
  const out = new Map<string, ComponentFactsList>();
  if (!db || !requests.length) return out;
  const result = await db.query<ComponentRow & { index_symbol: string; req_as_of: string; list_as_of: string }>(componentFactsSql(),
    [requests.map((r) => r.symbol), requests.map((r) => r.asOf)]);
  for (const row of result.rows) {
    const key = factsKey(row.index_symbol, row.req_as_of);
    let list = out.get(key);
    if (!list) out.set(key, list = { asOf: row.list_as_of, rows: [] });
    list.rows.push({
      code: row.code, exchange: row.exchange, vendorSymbol: row.exchange ? `${row.code}.${row.exchange}` : null, ticker: row.ticker,
      name: row.name, sector: row.sector, industry: row.industry, weight: num(row.weight),
      barDate: row.bar_date, close: num(row.close), ma50: num(row.ma50), ma200: num(row.ma200), state: row.state, stateAsOf: row.state_as_of,
    });
  }
  return out;
}

/**
 * The latest constituent list of an index joined to our instruments, with each matched instrument's latest bar on or
 * before `asOf`, its MA50 / MA200 over the stored closes, and its latest published rule state (the same rows the score
 * pages read: pageScoreRow, current scored membership).
 */
export async function indexComponentFacts(vendorSymbol: string, asOf: string, db: Query | null = getPool()): Promise<ComponentFactsList> {
  if (!db) return { asOf: null, rows: [] };
  return (await indexComponentFactsBatch([{ symbol: vendorSymbol, asOf }], db)).get(factsKey(vendorSymbol, asOf)) ?? { asOf: null, rows: [] };
}

/**
 * Point-in-time revenue and net income facts (quarters, and half-years from the vendor) for the given tickers, filed on or
 * before `asOf`, newest filing per period. 950 days of period ends cover a counted half-year up to 380 days old,
 * its year-ago period and the period before that for acceleration.
 */
export async function componentGrowthFacts(tickers: string[], asOf: string, db: Query | null = getPool()): Promise<GrowthFact[]> {
  if (!db || !tickers.length) return [];
  const rows = (await db.query<{ ticker: string; source_id: string; concept: string; period: "quarter" | "half"; period_end: string; value: string }>(
    `SELECT ticker,source_id,concept,period,period_end::text AS period_end,value::text AS value FROM (
       SELECT DISTINCT ON (ticker,source_id,concept,period,period_end) ticker,source_id,concept,period,period_end,value FROM (
         SELECT f.*,CASE WHEN f.period_end-f.period_start BETWEEN 80 AND 100 THEN 'quarter' ELSE 'half' END AS period FROM fundamentals_pit f
         WHERE f.ticker=ANY($1::text[]) AND f.filed<=$2::date AND f.period_start IS NOT NULL AND f.period_end<=$2::date
           AND f.period_end>$2::date-950
           AND (f.period_end-f.period_start BETWEEN 80 AND 100 OR (f.source_id='eodhd' AND f.period_end-f.period_start BETWEEN 170 AND 195))
           AND ((f.source_id='eodhd' AND f.taxonomy='eodhd' AND f.concept='Revenues')
             OR (f.source_id='sec' AND f.taxonomy='us-gaap' AND f.unit='USD' AND f.concept=ANY($3::text[])))
       ) f ORDER BY ticker,source_id,concept,period,period_end,filed DESC
     ) d ORDER BY ticker,source_id,concept,period,period_end`, [tickers, asOf, [...REVENUE_CONCEPTS, "NetIncomeLoss"]])).rows;
  return rows.map((row) => ({ ticker: row.ticker, source: row.source_id, concept: row.concept, period: row.period, periodEnd: row.period_end, value: Number(row.value) }));
}

export interface IndexRatingReadModel {
  snapshot: IndexSnapshot | null; analytics: IndexAnalytics; inputs: IndexRatingInputs | null; bars: IndexBar[];
  /** The whole constituent list the analytics used, heaviest first, with member facts and rule states. Not display-gated. */
  components: ComponentFactsList;
}

/** The rating date: the latest bar, or a newer weekly list (a list can arrive on a weekend after Friday's bar). */
const ratingDate = (barDate: string | null, componentDate: string | null) =>
  [barDate, componentDate].filter((date): date is string => date !== null).sort().at(-1) ?? null;

/**
 * Everything the index rating and the index pages need for one tracked index, or null when it is not a tracked index.
 * Constituent figures use the list stored on or before the index's latest bar. The model does not check display rights:
 * every consumer must sit behind the vendor gate (assertViewable / marketsViewable) before rendering any of it.
 */
export async function indexRatingReadModel(vendorSymbol: string, db: Query | null = getPool()): Promise<IndexRatingReadModel | null> {
  if (!db) return null;
  const tracked = (await db.query("SELECT 1 FROM tracked_assets WHERE vendor_symbol=$1 AND asset_class='index'", [vendorSymbol])).rows.length > 0;
  if (!tracked) return null;
  const bars = await indexBars(vendorSymbol, db);
  const volatility = isVolatilityIndex(vendorSymbol);
  const componentDate = volatility ? null : (await db.query<{ as_of: string | null }>(
    "SELECT max(as_of)::text AS as_of FROM index_components WHERE index_symbol=$1", [vendorSymbol])).rows[0]?.as_of ?? null;
  const barDate = bars.at(-1)?.date ?? null;
  const asOf = ratingDate(barDate, componentDate);
  const list = asOf && !volatility ? await indexComponentFacts(vendorSymbol, asOf, db) : { asOf: null, rows: [] };
  const tickers = [...new Set(list.rows.flatMap((row) => row.ticker ? [row.ticker] : []))];
  const [growthFacts, peers, snapshot] = await Promise.all([
    asOf ? componentGrowthFacts(tickers, asOf, db) : Promise.resolve([]),
    volatility ? Promise.resolve([]) : indexPeerSeries(db),
    latestIndexSnapshot(vendorSymbol, db),
  ]);
  const analytics = indexAnalytics({ symbol: vendorSymbol, bars, componentsAsOf: list.asOf, components: list.rows, growthFacts, peers });
  return { snapshot, analytics, inputs: barDate ? toRatingInputs(analytics, bars) : null, bars, components: list };
}

export interface IndexListModel { symbol: string; country: string | null; analytics: IndexAnalytics; inputs: IndexRatingInputs | null }

type ListBaseRow = { vendor_symbol: string; dates: string[] | null; closes: (string | number)[] | null; highs: (string | number | null)[] | null;
  lows: (string | number | null)[] | null; component_date: string | null; country: string | null };

/**
 * The rating read model for many indices at once, for the index list. It gives the same analytics and inputs as
 * indexRatingReadModel, without relative strength (the list does not show it), in a fixed number of set-based queries:
 * one for bars, list dates and countries, one for every constituent list with its member facts, and one growth query per
 * distinct rating date (usually one or two). Untracked symbols are left out; the order follows `symbols`.
 */
export async function indexListModels(symbols: readonly string[], db: Query | null = getPool()): Promise<IndexListModel[]> {
  if (!db || !symbols.length) return [];
  const base = (await db.query<ListBaseRow>(`SELECT a.vendor_symbol,b.dates,b.closes,b.highs,b.lows,c.component_date,s.country FROM tracked_assets a
    LEFT JOIN LATERAL (SELECT array_agg(x.bar_date::text ORDER BY x.bar_date) AS dates,array_agg(x.close ORDER BY x.bar_date) AS closes,
        array_agg(x.high ORDER BY x.bar_date) AS highs,array_agg(x.low ORDER BY x.bar_date) AS lows FROM asset_bars x
      WHERE x.vendor_symbol=a.vendor_symbol
        AND x.bar_date > (SELECT max(bar_date) FROM asset_bars WHERE vendor_symbol=a.vendor_symbol) - make_interval(years => $2::int)) b ON true
    LEFT JOIN LATERAL (SELECT max(as_of)::text AS component_date FROM index_components WHERE index_symbol=a.vendor_symbol) c ON true
    LEFT JOIN LATERAL (SELECT country FROM index_snapshots WHERE index_symbol=a.vendor_symbol ORDER BY as_of DESC LIMIT 1) s ON true
    WHERE a.asset_class='index' AND a.vendor_symbol=ANY($1::text[])`, [symbols, INDEX_RATING_YEARS])).rows;
  const items = base.map((row) => {
    const bars = (row.dates ?? []).map((date, i) => mapIndexBar({ bar_date: date, close: String(row.closes?.[i]),
      high: row.highs?.[i] == null ? null : String(row.highs[i]), low: row.lows?.[i] == null ? null : String(row.lows[i]) }));
    const volatility = isVolatilityIndex(row.vendor_symbol);
    const asOf = ratingDate(bars.at(-1)?.date ?? null, volatility ? null : row.component_date);
    return { symbol: row.vendor_symbol, country: row.country, bars, volatility, asOf };
  });
  const lists = await indexComponentFactsBatch(items.flatMap((item) => item.asOf && !item.volatility ? [{ symbol: item.symbol, asOf: item.asOf }] : []), db);
  const listOf = (item: (typeof items)[number]) => item.asOf && !item.volatility ? lists.get(factsKey(item.symbol, item.asOf)) ?? { asOf: null, rows: [] } : { asOf: null, rows: [] };
  const tickersByDate = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.asOf) continue;
    const set = tickersByDate.get(item.asOf) ?? new Set<string>();
    for (const row of listOf(item).rows) if (row.ticker) set.add(row.ticker);
    tickersByDate.set(item.asOf, set);
  }
  // One growth query per rating date, run in turn so the list never holds more than one pool connection.
  const growthByDate = new Map<string, GrowthFact[]>();
  for (const [asOf, tickers] of tickersByDate) growthByDate.set(asOf, await componentGrowthFacts([...tickers], asOf, db));
  const bySymbol = new Map(items.map((item) => {
    const list = listOf(item);
    const tickers = new Set(list.rows.flatMap((row) => row.ticker ? [row.ticker] : []));
    const growthFacts = item.asOf ? (growthByDate.get(item.asOf) ?? []).filter((fact) => tickers.has(fact.ticker)) : [];
    const analytics = indexAnalytics({ symbol: item.symbol, bars: item.bars, componentsAsOf: list.asOf, components: list.rows, growthFacts });
    return [item.symbol, { symbol: item.symbol, country: item.country, analytics, inputs: item.bars.length ? toRatingInputs(analytics, item.bars) : null }] as const;
  }));
  return symbols.flatMap((symbol) => bySymbol.get(symbol) ?? []);
}
