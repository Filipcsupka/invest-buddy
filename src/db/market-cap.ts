import type pg from "pg";
import type { HistoricalMarketCap } from "@/data-providers/eodhd/client";
import { canDisplay } from "@/data/sources-registry";
import { loadUniverse } from "./universe";
import { getPool } from "./pool";

type Query = Pick<pg.Pool, "query">;
export interface MarketCapPoint { date: string; value: number }
export interface MarketCapSubject { ticker: string; vendorSymbol: string; attemptedAt: string | null; latestWeek: string | null }

/** Vendor history keyed "0", "1", ... as ascending, de-duplicated weekly points. Invalid dates and values are dropped. */
export function parseMarketCap(payload: HistoricalMarketCap | unknown): MarketCapPoint[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const byDate = new Map<string, number>();
  for (const entry of Object.values(payload as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { date, value } = entry as { date?: unknown; value?: unknown };
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number) && number >= 0) byDate.set(date, number);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

/**
 * Collected universe names with a US vendor listing. EODHD's market cap history covers NYSE and NASDAQ only,
 * so other listings are not requested.
 */
export async function marketCapSubjects(db: Query, only?: string[]): Promise<MarketCapSubject[]> {
  const universe = (await loadUniverse(db, undefined, { collect: true })).map((row) => row.symbol).filter((ticker) => !only || only.includes(ticker));
  if (!universe.length) return [];
  const result = await db.query<{ ticker: string; vendor_symbol: string | null; attempted_at: string | null; latest_week: string | null }>(`SELECT i.ticker,
    COALESCE(ids.vendor_symbols->>'eodhd', s.vendor_symbol) AS vendor_symbol,
    to_char(r.attempted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS attempted_at, r.latest_week::text AS latest_week
    FROM instruments i
    LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL
    LEFT JOIN LATERAL (SELECT vendor_symbol FROM symbols WHERE NOT delisted AND
      (vendor_symbol=i.ticker OR (exchange='US' AND code=i.ticker))
      ORDER BY CASE WHEN vendor_symbol=i.ticker THEN 0 ELSE 1 END, exchange LIMIT 1) s ON true
    LEFT JOIN market_cap_refresh r ON r.vendor_symbol=COALESCE(ids.vendor_symbols->>'eodhd', s.vendor_symbol)
    WHERE i.ticker=ANY($1::text[]) ORDER BY r.attempted_at NULLS FIRST, i.ticker`, [universe]);
  return result.rows.filter((row) => row.vendor_symbol?.endsWith(".US"))
    .map((row) => ({ ticker: row.ticker, vendorSymbol: row.vendor_symbol!, attemptedAt: row.attempted_at, latestWeek: row.latest_week }));
}

/** Upsert weekly points and record the attempt. `points` null records a failed attempt. */
export async function saveMarketCap(db: Query, subject: Pick<MarketCapSubject, "ticker" | "vendorSymbol">, points: MarketCapPoint[] | null): Promise<number> {
  if (points?.length) await db.query(`INSERT INTO market_cap_weekly (vendor_symbol,week_end,market_cap,source_id,display_allowed)
    SELECT $1::text,t.week_end,t.market_cap,'eodhd',$4::boolean FROM unnest($2::date[],$3::numeric[]) AS t(week_end,market_cap)
    ON CONFLICT (vendor_symbol,week_end) DO UPDATE SET market_cap=EXCLUDED.market_cap,display_allowed=EXCLUDED.display_allowed`,
  [subject.vendorSymbol, points.map((point) => point.date), points.map((point) => point.value), canDisplay("eodhd")]);
  const status = points === null ? "failed" : points.length ? "ok" : "empty";
  await db.query(`INSERT INTO market_cap_refresh (vendor_symbol,ticker,attempted_at,latest_week,status) VALUES ($1,$2,now(),$3,$4)
    ON CONFLICT (vendor_symbol) DO UPDATE SET ticker=EXCLUDED.ticker,attempted_at=EXCLUDED.attempted_at,
      latest_week=COALESCE(EXCLUDED.latest_week,market_cap_refresh.latest_week),status=EXCLUDED.status`,
  [subject.vendorSymbol, subject.ticker, points?.at(-1)?.date ?? null, status]);
  return points?.length ?? 0;
}

/** Stored weekly market cap for a universe ticker, ascending, at most the last 400 weeks. */
export async function marketCapSeries(ticker: string, db: Query | null = getPool()): Promise<MarketCapPoint[]> {
  if (!db) return [];
  const result = await db.query<{ week_end: string; market_cap: string }>(`SELECT week_end,market_cap FROM (
      SELECT w.week_end::text AS week_end,w.market_cap FROM market_cap_refresh r JOIN market_cap_weekly w ON w.vendor_symbol=r.vendor_symbol
      WHERE r.ticker=$1 ORDER BY w.week_end DESC LIMIT 400) t ORDER BY week_end`, [ticker.toUpperCase()]);
  return result.rows.map((row) => ({ date: row.week_end, value: Number(row.market_cap) }));
}
