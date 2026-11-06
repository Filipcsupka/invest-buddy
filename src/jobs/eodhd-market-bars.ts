import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls, trackedAssets, upsertAssetBars, type AssetClass } from "../db/asset-bars";
import { runLoggedJob } from "./job-log";

const DAY = 86_400_000;
export interface MarketBarsArgs { assetClass?: AssetClass; dryRun: boolean; backfill: number }
export function parseMarketBarsArgs(args: string[]): MarketBarsArgs {
  const out: MarketBarsArgs = { dryRun: false, backfill: 5 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--class") { const value = args[++i]; if (value !== "all" && value !== "index" && value !== "fx" && value !== "crypto") throw new Error("--class needs index|fx|crypto|all"); out.assetClass = value === "all" ? undefined : value; }
    else if (args[i] === "--backfill") out.backfill = Number(args[++i]);
    else throw new Error(`Unknown market-bars option ${args[i]}`);
  }
  if (!Number.isInteger(out.backfill) || out.backfill < 1 || out.backfill > 30) throw new Error("--backfill needs 1..30 years");
  return out;
}

export async function runMarketBars(db: Pick<pg.Pool, "query">, api: Pick<EodhdClient, "eod" | "getCallCosts"> | null, options: MarketBarsArgs, today = new Date().toISOString().slice(0, 10)) {
  const assets = await trackedAssets(db, options.assetClass);
  let rows = 0, refreshed = 0;
  const failures: string[] = [];
  try {
    if (!options.dryRun && api) for (const asset of assets) {
      // Re-read the latest stored day: a crypto or FX bar fetched before its session closed was partial (BTC-USD.CC, 2026-11-06 21:57 UTC).
      const from = asset.last_bar_date ? asset.last_bar_date
        : new Date(Date.parse(`${today}T00:00:00Z`) - Math.round(options.backfill * 365.25) * DAY).toISOString().slice(0, 10);
      if (from > today) continue;
      try {
        rows += await upsertAssetBars(db, asset, await api.eod(asset.vendor_symbol, { from, to: today }));
        refreshed++;
      } catch (error) {
        failures.push(asset.vendor_symbol);
        if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) break;
      }
    }
  } finally {
    const calls = api?.getCallCosts().eod ?? 0;
    if (calls > 0) await logEodhdCalls(db, "eodhd-market-bars", calls);
  }
  return { assets: assets.length, estimatedCalls: assets.length, refreshed, rows, failures: failures.length, failedSymbols: failures.join(","), calls: api?.getCallCosts().eod ?? 0 };
}

if (process.argv[1]?.endsWith("eodhd-market-bars.ts") || process.argv[1]?.endsWith("eodhd-market-bars.js")) {
  const options = parseMarketBarsArgs(process.argv.slice(2));
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runLoggedJob("eodhd-market-bars", async () => {
    try { const result = await runMarketBars(db, options.dryRun ? null : new EodhdClient(), options); if (result.failures) process.exitCode = 1; return result; }
    finally { await db.end(); }
  }, options.dryRun ? { store: null } : {});
}
