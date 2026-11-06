import type pg from "pg";
import type { EodBar } from "../data-providers/eodhd/client";
import { canDisplay } from "../data/sources-registry";

export type AssetClass = "index" | "fx" | "crypto" | "etf";
export interface TrackedAsset { vendor_symbol: string; asset_class: AssetClass; currency: string | null; last_bar_date: string | null }

/** Without a class, ETF rows are left out: the eodhd-etf job refreshes their bars. */
export async function trackedAssets(db: Pick<pg.Pool, "query">, assetClass?: AssetClass): Promise<TrackedAsset[]> {
  const result = await db.query<TrackedAsset>(`SELECT a.vendor_symbol, a.asset_class, a.currency,
    (SELECT max(bar_date)::text FROM asset_bars b WHERE b.vendor_symbol=a.vendor_symbol) AS last_bar_date
    FROM tracked_assets a WHERE enabled AND (($1::text IS NULL AND asset_class<>'etf') OR asset_class=$1) ORDER BY sort,vendor_symbol`, [assetClass ?? null]);
  return result.rows;
}

/** Upsert each dated bar, retaining one observation per vendor symbol and day. */
export async function upsertAssetBars(db: Pick<pg.Pool, "query">, asset: TrackedAsset, bars: EodBar[]): Promise<number> {
  let saved = 0;
  for (const bar of bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || typeof bar.close !== "number" || !Number.isFinite(bar.close)) continue;
    await db.query(`INSERT INTO asset_bars (vendor_symbol,bar_date,open,high,low,close,volume,currency,source_id,display_allowed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'eodhd',$9)
      ON CONFLICT (vendor_symbol,bar_date) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,
      close=EXCLUDED.close,volume=EXCLUDED.volume,currency=EXCLUDED.currency,source_id=EXCLUDED.source_id,display_allowed=EXCLUDED.display_allowed`,
      [asset.vendor_symbol, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume, asset.currency, canDisplay("eodhd")]);
    saved++;
  }
  return saved;
}

export async function logEodhdCalls(db: Pick<pg.Pool, "query">, job: string, calls: number): Promise<void> {
  await db.query(`INSERT INTO eodhd_call_log (job,run_date,calls) VALUES ($1,CURRENT_DATE,$2)
    ON CONFLICT (job,run_date) DO UPDATE SET calls=eodhd_call_log.calls+EXCLUDED.calls`, [job, calls]);
}
