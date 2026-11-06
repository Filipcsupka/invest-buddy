import type pg from "pg";
import type { ScreenerRow } from "@/data-providers/eodhd/client";
import { canDisplay } from "@/data/sources-registry";
import { getPool } from "./pool";
import type { ScreenerPreset } from "./screener-presets";

type Query = Pick<pg.Pool, "query">;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

export interface StoredScreenerRow {
  rank: number; code: string; exchange: string; name: string | null; sector: string | null; industry: string | null; currencySymbol: string | null;
  lastDay: string | null; close: number | null; change1d: number | null; change5d: number | null; marketCap: number | null; dividendYield: number | null; avgVolume200d: number | null;
}

/** Vendor rows to stored rows, in response order. Rows without a code or exchange, and repeats, are dropped. */
export function mapScreenerRows(rows: ScreenerRow[]): StoredScreenerRow[] {
  const seen = new Set<string>();
  const out: StoredScreenerRow[] = [];
  for (const row of rows) {
    const code = text(row.code), exchange = text(row.exchange);
    if (!code || !exchange || seen.has(`${code}.${exchange}`)) continue;
    seen.add(`${code}.${exchange}`);
    const day = text(row.last_day_data_date);
    out.push({
      rank: out.length + 1, code, exchange, name: text(row.name), sector: text(row.sector), industry: text(row.industry), currencySymbol: text(row.currency_symbol),
      lastDay: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null, close: num(row.adjusted_close), change1d: num(row.refund_1d_p), change5d: num(row.refund_5d_p),
      marketCap: num(row.market_capitalization), dividendYield: num(row.dividend_yield), avgVolume200d: num(row.avgvol_200d),
    });
  }
  return out;
}

/** True when this preset already has a stored run for the day. */
export async function screenerRunExists(db: Query, preset: string, asOf: string): Promise<boolean> {
  return (await db.query("SELECT 1 FROM screener_runs WHERE preset=$1 AND as_of=$2", [preset, asOf])).rows.length > 0;
}

/** Replace the day's run for one preset. Call inside a transaction so readers never see a half-written run. */
export async function saveScreenerRun(db: Query, preset: ScreenerPreset, asOf: string, rows: StoredScreenerRow[]): Promise<number> {
  const run = await db.query<{ id: string }>(`INSERT INTO screener_runs (preset,as_of,filters,signals,sort,row_count,source_id,display_allowed,fetched_at)
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,'eodhd',$7,now())
    ON CONFLICT (preset,as_of) DO UPDATE SET filters=EXCLUDED.filters,signals=EXCLUDED.signals,sort=EXCLUDED.sort,row_count=EXCLUDED.row_count,
      display_allowed=EXCLUDED.display_allowed,fetched_at=EXCLUDED.fetched_at RETURNING id`,
  [preset.id, asOf, JSON.stringify(preset.filters), preset.signals ?? null, preset.sort, rows.length, canDisplay("eodhd")]);
  const id = run.rows[0].id;
  await db.query("DELETE FROM screener_rows WHERE run_id=$1", [id]);
  for (const row of rows) await db.query(`INSERT INTO screener_rows (run_id,rank,code,exchange,name,sector,industry,currency_symbol,last_day,adjusted_close,
      change_1d_pct,change_5d_pct,market_cap,dividend_yield,avgvol_200d) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [id, row.rank, row.code, row.exchange, row.name, row.sector, row.industry, row.currencySymbol, row.lastDay, row.close, row.change1d, row.change5d, row.marketCap, row.dividendYield, row.avgVolume200d]);
  return rows.length;
}

export interface ScreenerRunSummary { preset: string; asOf: string; rowCount: number }

/** The latest stored run per preset. */
export async function latestScreenerRuns(db: Query | null = getPool()): Promise<ScreenerRunSummary[]> {
  if (!db) return [];
  const result = await db.query<{ preset: string; as_of: string; row_count: number }>(
    "SELECT DISTINCT ON (preset) preset,as_of::text AS as_of,row_count FROM screener_runs ORDER BY preset,as_of DESC LIMIT 50");
  return result.rows.map((row) => ({ preset: row.preset, asOf: row.as_of, rowCount: Number(row.row_count) }));
}

type RowRecord = { rank: number; code: string; exchange: string; name: string | null; sector: string | null; industry: string | null; currency_symbol: string | null; last_day: string | null;
  adjusted_close: string | null; change_1d_pct: string | null; change_5d_pct: string | null; market_cap: string | null; dividend_yield: string | null; avgvol_200d: string | null };

/** Rows of the latest stored run for one preset, at most 100. */
export async function screenerResults(preset: string, db: Query | null = getPool()): Promise<{ asOf: string | null; rows: StoredScreenerRow[] }> {
  if (!db) return { asOf: null, rows: [] };
  const run = (await db.query<{ id: string; as_of: string }>("SELECT id,as_of::text AS as_of FROM screener_runs WHERE preset=$1 ORDER BY as_of DESC LIMIT 1", [preset])).rows[0];
  if (!run) return { asOf: null, rows: [] };
  const rows = (await db.query<RowRecord>(`SELECT rank,code,exchange,name,sector,industry,currency_symbol,last_day::text AS last_day,adjusted_close,change_1d_pct,change_5d_pct,
    market_cap,dividend_yield,avgvol_200d FROM screener_rows WHERE run_id=$1 ORDER BY rank LIMIT 100`, [run.id])).rows;
  return { asOf: run.as_of, rows: rows.map((row) => ({
    rank: Number(row.rank), code: row.code, exchange: row.exchange, name: row.name, sector: row.sector, industry: row.industry, currencySymbol: row.currency_symbol, lastDay: row.last_day,
    close: num(row.adjusted_close), change1d: num(row.change_1d_pct), change5d: num(row.change_5d_pct), marketCap: num(row.market_cap), dividendYield: num(row.dividend_yield), avgVolume200d: num(row.avgvol_200d),
  })) };
}
