import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import spy from "./fixtures/eodhd-etf/spy-etf.json";
import iwda from "./fixtures/eodhd-etf/iwda-etf.json";
import spyDividends from "./fixtures/eodhd-etf/spy-div.json";
import iwdaBars from "./fixtures/eodhd-etf/iwda-eod.json";
import { parseEtfJobArgs, runEtfJob } from "./eodhd-etf";
import { trackedAssets } from "../db/asset-bars";
import { etfDetailView, etfListStats } from "../db/etf-detail";

async function migratedPool() {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  const query = (sql: string, params?: unknown[]) => db.query(sql, params);
  return { db, pool: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool };
}

const api = () => {
  const costs = { fundamentals: 0, dividends: 0, eod: 0 };
  return {
    fundamentals: async <T,>(symbol: string) => { costs.fundamentals += 10; return (symbol === "SPY.US" ? spy : iwda) as T; },
    dividends: async (symbol: string) => { costs.dividends += 1; return symbol === "SPY.US" ? spyDividends : []; },
    eod: async () => { costs.eod += 1; return iwdaBars; },
    getCallCosts: () => ({ ...costs }),
  };
};

describe("eodhd-etf against the migrated schema (PGlite)", () => {
  it("tracks catalog ETFs, stores detail, keeps market bars separate and reruns idempotently", async () => {
    const { db, pool } = await migratedPool();
    try {
      await pool.query(`INSERT INTO etf_catalog (listing_key,isin,mnemonic,name,instrument_type,exchange,listing_region,trading_currency,enrichment_status,shortlist,shortlist_rank,first_seen,last_seen) VALUES
        ('NYSEARCA:SPY','US78462F1030','SPY','SPDR S&P 500','ETF','NYSEARCA','US','USD','ok',true,1,CURRENT_DATE,CURRENT_DATE),
        ('IE00B4L5Y983','IE00B4L5Y983','EUNL','iShares Core MSCI World','ETF','XETR','EU','EUR','ok',false,NULL,CURRENT_DATE,CURRENT_DATE),
        ('DE0000000999','DE0000000999','PEND','Pending fund','ETF','XETR','EU','EUR','pending',false,NULL,CURRENT_DATE,CURRENT_DATE)`);
      await pool.query(`INSERT INTO symbols (vendor_symbol,code,exchange,name,isin,currency,type,first_seen,last_seen) VALUES
        ('IWDA.AS','IWDA','AS','iShares Core MSCI World','IE00B4L5Y983','EUR','ETF',CURRENT_DATE,CURRENT_DATE)`);
      const today = new Date().toISOString().slice(0, 10);

      const dry = await runEtfJob(pool, null, parseEtfJobArgs(["--dry-run"], {}), today);
      expect(dry).toMatchObject({ candidates: 2, due: 1, calls: 0 });
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_tracked")).rows[0]).toEqual({ n: 0 });

      // Fourteen tracked ETFs would give a slice of two; with two tracked the slice is one per night.
      const first = await runEtfJob(pool, api(), parseEtfJobArgs([], {}), today);
      expect(first).toMatchObject({ active: 2, due: 1, processed: 1, failures: 0, calls: 12 });
      const second = await runEtfJob(pool, api(), parseEtfJobArgs([], {}), today);
      expect(second).toMatchObject({ due: 1, processed: 1, calls: 12 });
      const third = await runEtfJob(pool, api(), parseEtfJobArgs([], {}), today);
      expect(third).toMatchObject({ due: 0, processed: 0, calls: 0 });

      expect((await pool.query("SELECT vendor_symbol,asset_class,currency FROM tracked_assets WHERE asset_class='etf' ORDER BY sort")).rows)
        .toEqual([{ vendor_symbol: "SPY.US", asset_class: "etf", currency: "USD" }, { vendor_symbol: "IWDA.AS", asset_class: "etf", currency: "EUR" }]);
      expect((await trackedAssets(pool)).some((asset) => asset.asset_class === "etf")).toBe(false);
      expect((await trackedAssets(pool, "etf")).map((asset) => asset.vendor_symbol).sort()).toEqual(["IWDA.AS", "SPY.US"]);
      expect((await pool.query("SELECT calls FROM eodhd_call_log WHERE job='eodhd-etf'")).rows).toEqual([{ calls: 24 }]);
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_fund_stats WHERE display_allowed")).rows[0]).toEqual({ n: 0 });

      const spyView = await etfDetailView("NYSEARCA:SPY", {}, pool);
      expect(spyView.stats).toMatchObject({ vendorSymbol: "SPY.US", yieldPct: 1, holdingsCount: 501, holdingsListed: 12, totalAssetsCurrency: "USD" });
      const captured = await pool.query("SELECT category,open_figi,index_name,total_assets_currency,payload->'General'->>'Category' AS raw_category FROM etf_fund_stats WHERE listing_key='NYSEARCA:SPY'");
      expect(captured.rows[0]).toMatchObject({ category: "US Equity", open_figi: "BBG000BDTBL9", index_name: "S&P 500 Index", total_assets_currency: "USD", raw_category: "US Equity" });
      expect(spyView.holdings[0]).toMatchObject({ position: 1, symbol: "NVDA", weightPct: 7.8879 });
      expect(spyView.dividends).toHaveLength(3);
      expect(spyView.bars).toHaveLength(3);
      const iwdaView = await etfDetailView("IE00B4L5Y983", {}, pool);
      expect(iwdaView.stats).toMatchObject({ yieldPct: null, ongoingChargePct: 0.1974, holdingsListed: 10 });
      expect(iwdaView.exposure.region.length).toBeGreaterThan(0);
      expect(iwdaView.dividends).toEqual([]);
      expect((await etfListStats(["NYSEARCA:SPY", "IE00B4L5Y983", "DE0000000999"], pool)).get("NYSEARCA:SPY")).toMatchObject({ yieldPct: 1, ret1yPct: 14.2171 });

      // A listing that leaves the selection is deactivated and its bars stop.
      await pool.query("UPDATE etf_catalog SET enrichment_status='failed' WHERE listing_key='IE00B4L5Y983'");
      const dropped = await runEtfJob(pool, api(), parseEtfJobArgs([], {}), today);
      expect(dropped).toMatchObject({ active: 1, deactivated: 1 });
      expect((await trackedAssets(pool, "etf")).map((asset) => asset.vendor_symbol)).toEqual(["SPY.US"]);
    } finally { await db.close(); }
  }, 60_000);
});
