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
import { etfDetailView } from "../db/etf-detail";

async function migratedPool() {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  const query = (sql: string, params?: unknown[]) => db.query(sql, params);
  return { db, pool: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool };
}
const api = () => {
  const costs = { fundamentals: 0, dividends: 0, eod: 0, splits: 0, "eod-bulk-last-day": 0 };
  return {
    fundamentals: async <T,>(symbol: string) => { costs.fundamentals += 10; return (symbol === "SPY.US" ? spy : iwda) as T; },
    dividends: async (symbol: string) => { costs.dividends++; return symbol === "SPY.US" ? spyDividends : []; },
    eod: async () => { costs.eod++; return iwdaBars; },
    splits: async () => { costs.splits++; return []; },
    eodBulkLastDay: async () => { costs["eod-bulk-last-day"] += 100; return [{ code: "SPY", date: "2026-11-06", open: 100, high: 102, low: 99, close: 101, volume: 1000 }]; },
    getCallCosts: () => ({ ...costs }),
  };
};

describe("ETF throughput against migrated schema", () => {
  it("tracks all enriched in-scope ETFs and runs the three cadences independently", async () => {
    const { db, pool } = await migratedPool();
    try {
      await pool.query(`INSERT INTO etf_catalog (listing_key,isin,mnemonic,name,instrument_type,exchange,listing_region,trading_currency,enrichment_status,shortlist,shortlist_rank,first_seen,last_seen,ucits_hint) VALUES
        ('NYSEARCA:SPY','US78462F1030','SPY','SPDR S&P 500','ETF','NYSEARCA','US','USD','ok',true,1,CURRENT_DATE,CURRENT_DATE,NULL),
        ('IE00B4L5Y983','IE00B4L5Y983','EUNL','iShares Core MSCI World','ETF','XETR','EU','EUR','ok',false,NULL,CURRENT_DATE,CURRENT_DATE,true),
        ('IE0000000001','IE0000000001','NEW','Third ETF','ETF','XETR','EU','EUR','ok',false,NULL,CURRENT_DATE,CURRENT_DATE,NULL),
        ('DE0000000999','DE0000000999','PEND','Pending fund','ETF','XETR','EU','EUR','pending',false,NULL,CURRENT_DATE,CURRENT_DATE,NULL),
        ('NYSEARCA:LEV',NULL,'LEV','2x leveraged ETF','ETF','NYSEARCA','US','USD','ok',false,NULL,CURRENT_DATE,CURRENT_DATE,NULL)`);
      await pool.query(`INSERT INTO symbols (vendor_symbol,code,exchange,name,isin,currency,type,first_seen,last_seen) VALUES
        ('IWDA.AS','IWDA','AS','iShares Core MSCI World','IE00B4L5Y983','EUR','ETF',CURRENT_DATE,CURRENT_DATE),
        ('NEW.AS','NEW','AS','Third ETF','IE0000000001','EUR','ETF',CURRENT_DATE,CURRENT_DATE)`);
      const today = "2026-11-06";
      const dry = await runEtfJob(pool, null, parseEtfJobArgs(["--dry-run"], {}), today);
      expect(dry).toMatchObject({ candidates: 3, calls: 0 });
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_tracked")).rows[0]).toEqual({ n: 0 });

      const bars = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "bars"], {}), today);
      // Under 100 funds per exchange, per-symbol requests (1 call each) replace the 100-call bulk file.
      expect(bars).toMatchObject({ active: 3, due: 3, bulkExchanges: 0, calls: 3 });
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_tracked WHERE active")).rows[0]).toEqual({ n: 3 });
      expect((await trackedAssets(pool, "etf")).map((r) => r.vendor_symbol).sort()).toEqual(["IWDA.AS", "NEW.AS", "SPY.US"]);
      expect((await pool.query("SELECT count(DISTINCT vendor_symbol)::int AS n FROM asset_bars")).rows[0]).toEqual({ n: 3 });
      expect((await pool.query("SELECT calls FROM eodhd_call_log WHERE job='eodhd-etf'")).rows).toEqual([{ calls: 3 }]);

      const backfill = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "backfill", "--limit", "2"], {}), today);
      expect(backfill).toMatchObject({ due: 2, processed: 2, calls: 2 });
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_tracked WHERE bars_fetched_at IS NOT NULL")).rows[0]).toEqual({ n: 2 });
      const remaining = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "backfill", "--limit", "2"], {}), today);
      expect(remaining).toMatchObject({ due: 1, processed: 1, calls: 1 });
      const finished = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "backfill"], {}), today);
      expect(finished).toMatchObject({ due: 0, calls: 0 });

      const dividends = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "dividends"], {}), today);
      expect(dividends).toMatchObject({ due: 3, processed: 3, calls: 3, dividends: 3 });
      const dividendsAgain = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "dividends"], {}), today);
      expect(dividendsAgain).toMatchObject({ due: 0, calls: 0 });

      const fundamentals = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "fundamentals"], {}), today);
      expect(fundamentals).toMatchObject({ due: 3, processed: 3, calls: 30 });
      expect((await etfDetailView("NYSEARCA:SPY", {}, pool)).stats).toMatchObject({ vendorSymbol: "SPY.US", holdingsCount: 501 });
      expect((await pool.query("SELECT calls FROM eodhd_call_log WHERE job='eodhd-etf-fundamentals'")).rows).toEqual([{ calls: 30 }]);
      const detailAgain = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "fundamentals"], {}), today);
      expect(detailAgain).toMatchObject({ due: 0, calls: 0 });
      expect((await pool.query("SELECT detail_status FROM etf_tracked WHERE listing_key='IE0000000001'")).rows[0]).toEqual({ detail_status: "isin_mismatch" });
      const safeBars = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "bars"], {}), today);
      expect(safeBars).toMatchObject({ due: 2 });

      await pool.query("UPDATE etf_catalog SET enrichment_status='failed' WHERE listing_key='IE00B4L5Y983'");
      const dropped = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "bars"], {}), today);
      expect(dropped).toMatchObject({ active: 2, deactivated: 1 });
      expect((await trackedAssets(pool, "etf")).map((r) => r.vendor_symbol).sort()).toEqual(["NEW.AS", "SPY.US"]);

      // A capped run leaves listings outside the cap active.
      const capped = await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "bars", "--max-tracked", "1"], {}), today);
      expect(capped).toMatchObject({ active: 1, deactivated: 0 });
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_tracked WHERE active")).rows[0]).toEqual({ n: 2 });

      // A new vendor symbol for a listing restarts history, dividends and detail.
      await pool.query(`INSERT INTO symbols (vendor_symbol,code,exchange,name,isin,currency,type,first_seen,last_seen) VALUES
        ('NEW.XETRA','NEW','XETRA','Third ETF','IE0000000001','EUR','ETF',CURRENT_DATE,CURRENT_DATE)`);
      const empty = { ...api(), eod: async () => [] };
      const moved = await runEtfJob(pool, empty, parseEtfJobArgs(["--mode", "backfill"], {}), today);
      expect((await pool.query("SELECT vendor_symbol, detail_status, dividends_fetched_at FROM etf_tracked WHERE listing_key='IE0000000001'")).rows[0])
        .toEqual({ vendor_symbol: "NEW.XETRA", detail_status: null, dividends_fetched_at: null });
      // The new symbol's history came back empty, so it waits for a retry and the queue is drained.
      expect(moved).toMatchObject({ due: 1, empty: 1, failures: 0 });
      expect((await runEtfJob(pool, api(), parseEtfJobArgs(["--mode", "backfill"], {}), today))).toMatchObject({ due: 0, calls: 0 });
      expect((await pool.query("SELECT bars_retry_after > now() AS waiting FROM etf_tracked WHERE listing_key='IE0000000001'")).rows[0]).toEqual({ waiting: true });
    } finally { await db.close(); }
  }, 90_000);
});
