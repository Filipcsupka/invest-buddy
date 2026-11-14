import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { indexListStamp } from "../data/index-list";
import { indexComponentFacts, indexListModels, indexRatingReadModel } from "./markets";

/** Every migration applied to an in-memory database; `queries` counts the statements the reads send. */
async function withDb(fn: (pool: pg.Pool, counter: { queries: number }) => Promise<void>) {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  const counter = { queries: 0 };
  try { await fn({ query: (sql: string, params?: unknown[]) => { counter.queries += 1; return db.query(sql, params); } } as unknown as pg.Pool, counter); } finally { await db.close(); }
}

/** GSPC and NDX share AAPL and MSFT; GSPC's weekly list is newer than its last bar, so the two indices have different rating dates. */
async function seed(pool: pg.Pool) {
  await pool.query("UPDATE instrument_ids SET vendor_symbols=jsonb_build_object('eodhd',ticker||'.US') WHERE ticker IN ('AAPL','MSFT') AND valid_to IS NULL");
  for (const symbol of ["GSPC.INDX", "NDX.INDX", "VIX.INDX"]) {
    await pool.query(`INSERT INTO asset_bars(vendor_symbol,bar_date,close,high,low)
      SELECT $1,DATE '2026-11-12'-g,6000-g+(g%7),6010-g,5990-g FROM generate_series(0,400) g`, [symbol]);
  }
  await pool.query(`INSERT INTO index_components(index_symbol,as_of,code,exchange,sector,weight) VALUES
    ('GSPC.INDX','2026-11-14','AAPL','US','Technology',0.6),('GSPC.INDX','2026-11-14','MSFT','US','Technology',0.3),('GSPC.INDX','2026-11-14','UNKNOWN','US','Other',0.1),
    ('NDX.INDX','2026-11-12','AAPL','US','Technology',0.5),('NDX.INDX','2026-11-12','MSFT','US','Technology',0.5)`);
  await pool.query(`INSERT INTO daily_bars(ticker,bar_date,open,high,low,close,volume)
    SELECT t,DATE '2026-11-14'-g,101,102,99,CASE WHEN g=0 THEN 101 ELSE 100 END,1000 FROM generate_series(0,210) g, unnest(ARRAY['AAPL','MSFT']) t`);
  await pool.query(`INSERT INTO score_results(ticker,as_of,technical,fundamentals,macro,total,state,audit) VALUES
    ('AAPL','2026-11-12',5,5,5,15,'Criteria broken','{"scanRunId":"test"}'),('MSFT','2026-11-13',9,9,5,23,'Setup met (>=18)','{"scanRunId":"test"}')`);
  await pool.query(`INSERT INTO fundamentals_pit(ticker,concept,taxonomy,unit,period_start,period_end,form,filed,accession,value) VALUES
    ('AAPL','Revenues','us-gaap','USD','2025-07-01','2025-09-30','10-Q','2025-11-01','a1',100),('AAPL','Revenues','us-gaap','USD','2026-07-01','2026-09-30','10-Q','2026-11-01','a2',120),
    ('MSFT','Revenues','us-gaap','USD','2025-07-01','2025-09-30','10-Q','2025-11-01','m1',100),('MSFT','Revenues','us-gaap','USD','2026-07-01','2026-09-30','10-Q','2026-11-13','m2',90)`);
  await pool.query("INSERT INTO index_snapshots(index_symbol,as_of,general,name,country,component_count,weighted_count,request_filter,fetched_at,source_id,display_allowed) VALUES ('GSPC.INDX','2026-11-14','{}','S&P 500','USA',3,3,'General,Components',now(),'eodhd',true)");
}

describe("index list read model (PGlite)", () => {
  it("matches the single-index read model for every index, without relative strength", () => withDb(async (pool) => {
    await seed(pool);
    const symbols = ["GSPC.INDX", "NDX.INDX", "VIX.INDX", "NOPE.INDX"];
    const list = await indexListModels(symbols, pool);
    expect(list.map((row) => row.symbol)).toEqual(["GSPC.INDX", "NDX.INDX", "VIX.INDX"]);
    expect(list[0]!.country).toBe("USA");
    for (const row of list) {
      const single = await indexRatingReadModel(row.symbol, pool);
      expect(row.analytics).toEqual({ ...single!.analytics, relativeStrength: null });
      expect(row.inputs).toEqual(single!.inputs);
    }
    const gspc = list[0]!;
    expect(gspc.inputs?.asOf).toBe("2026-11-14");
    expect(gspc.analytics.matched).toMatchObject({ n: 2, of: 3 });
    // MSFT's later filing is dated after NDX's rating day, so only GSPC (rated on the newer list date) counts it.
    expect(gspc.analytics.earnings?.revenueUp).toMatchObject({ n: 2 });
    expect(list[1]!.analytics.earnings?.revenueUp).toMatchObject({ n: 1 });
    expect(gspc.analytics.scores?.states).toEqual({ "Criteria broken": 1, "Setup met (>=18)": 1 });
    expect(list[1]!.analytics.scores?.states).toEqual({ "Criteria broken": 1 });
  }), 60_000);

  it("reads the whole list in a fixed number of queries, where the per-index path grows with every index", () => withDb(async (pool, counter) => {
    await seed(pool);
    const tracked = (await pool.query<{ vendor_symbol: string }>("SELECT vendor_symbol FROM tracked_assets WHERE enabled AND asset_class='index' ORDER BY sort,vendor_symbol")).rows.map((row) => row.vendor_symbol);
    expect(tracked.length).toBeGreaterThanOrEqual(25);
    counter.queries = 0;
    for (const symbol of tracked) await indexRatingReadModel(symbol, pool);
    const perIndex = counter.queries;
    counter.queries = 0;
    await indexListModels(tracked, pool);
    const batched = counter.queries;
    // Bars, lists and countries; every constituent list with member facts; one growth query per rating date (two here).
    expect(batched).toBe(4);
    expect(perIndex).toBeGreaterThan(100);
  }), 60_000);

  it("moves the list cache key with a new rule state date or constituent attempt, in one query", () => withDb(async (pool, counter) => {
    await seed(pool);
    counter.queries = 0;
    const first = await indexListStamp(pool);
    expect(counter.queries).toBe(1);
    expect(first.startsWith("2026-11-13|")).toBe(true);
    await pool.query(`INSERT INTO score_results(ticker,as_of,technical,fundamentals,macro,total,state,audit) VALUES ('AAPL','2026-11-14',5,5,5,15,'Watch','{"scanRunId":"t2"}')`);
    const second = await indexListStamp(pool);
    expect(second.startsWith("2026-11-14|")).toBe(true);
    await pool.query("INSERT INTO index_component_refresh(index_symbol,attempted_at,row_count,status) VALUES ('GSPC.INDX',now(),3,'ok')");
    expect(await indexListStamp(pool)).not.toBe(second);
  }), 60_000);

  it("keeps the single-index facts read on the batched statement", () => withDb(async (pool, counter) => {
    await seed(pool);
    counter.queries = 0;
    const list = await indexComponentFacts("GSPC.INDX", "2026-11-14", pool);
    expect(counter.queries).toBe(1);
    expect(list.asOf).toBe("2026-11-14");
    expect(list.rows.map((row) => [row.code, row.ticker, row.state])).toEqual([["AAPL", "AAPL", "Criteria broken"], ["MSFT", "MSFT", "Setup met (>=18)"], ["UNKNOWN", null, null]]);
    expect(await indexComponentFacts("GSPC.INDX", "2020-01-01", pool)).toEqual({ asOf: null, rows: [] });
  }), 60_000);
});
