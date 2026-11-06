import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { assetDetail, assetSummaries, componentsDue, indexComponents, saveComponents } from "./markets";
import { latestScreenerRuns, mapScreenerRows, saveScreenerRun, screenerResults } from "./screener";
import { SCREENER_PRESETS } from "./screener-presets";
import { marketCapSeries, saveMarketCap } from "./market-cap";

/** A fresh in-memory database with every migration applied, so migration 120 and these queries run as written. */
async function inRollback(fn: (pool: pg.Pool) => Promise<void>) {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  try { await fn({ query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as pg.Pool); } finally { await db.close(); }
}

describe("market view tables (PGlite)", () => {
  it("summarizes stored bars with the prior-year base and reads a detail", () => inRollback(async (pool) => {
    await pool.query(`INSERT INTO asset_bars (vendor_symbol,bar_date,open,high,low,close) VALUES
      ('GSPC.INDX','2025-12-31',90,95,85,90),('GSPC.INDX','2026-11-04',99,101,98,100),('GSPC.INDX','2026-11-05',100,104,99,103)`);
    const rows = await assetSummaries("index", pool);
    const gspc = rows.find((row) => row.symbol === "GSPC.INDX")!;
    expect(rows.length).toBe(25);
    expect(gspc).toMatchObject({ last: 103, lastDate: "2026-11-05", spark: [90, 100, 103] });
    expect(gspc.change1d).toBeCloseTo(0.03);
    expect(gspc.changeYtd).toBeCloseTo(103 / 90 - 1);
    const detail = await assetDetail("index", "GSPC.INDX", pool);
    expect(detail?.bars).toHaveLength(3);
    expect(detail).toMatchObject({ high52: 104, low52: 85 });
    expect(await assetDetail("fx", "GSPC.INDX", pool)).toBeNull();
  }), 60_000);
  it("replaces a day's constituents and tracks attempts", () => inRollback(async (pool) => {
    await saveComponents(pool, "GSPC.INDX", "2026-11-08", [{ code: "AIZ", exchange: "US", name: "Assurant", sector: null, industry: null, weight: 0.0002 }, { code: "OLD", exchange: "US", name: null, sector: null, industry: null, weight: null }]);
    await saveComponents(pool, "GSPC.INDX", "2026-11-08", [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: null, industry: null, weight: 0.0003 }]);
    await saveComponents(pool, "VIX.INDX", "2026-11-08", []);
    const stored = await indexComponents("GSPC.INDX", pool);
    expect(stored).toEqual({ asOf: "2026-11-08", rows: [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: null, industry: null, weight: 0.0003 }] });
    const due = await componentsDue(pool, "2000-01-01");
    expect(due).not.toContain("GSPC.INDX");
    expect(due).not.toContain("VIX.INDX");
    expect(await componentsDue(pool, "2999-01-01", ["GSPC.INDX"])).toEqual(["GSPC.INDX"]);
  }), 60_000);
  it("stores screener runs idempotently and market cap points", () => inRollback(async (pool) => {
    const rows = mapScreenerRows([{ code: "AAPL", exchange: "US", name: "Apple Inc.", adjusted_close: 342.37, refund_1d_p: -0.52, market_capitalization: 5001541320704, dividend_yield: 0.003 }]);
    await saveScreenerRun(pool, SCREENER_PRESETS[0], "2026-11-07", rows);
    await saveScreenerRun(pool, SCREENER_PRESETS[0], "2026-11-07", rows);
    expect(await latestScreenerRuns(pool)).toContainEqual({ preset: "us-mega-cap", asOf: "2026-11-07", rowCount: 1 });
    expect((await screenerResults("us-mega-cap", pool)).rows).toEqual(rows);
    await saveMarketCap(pool, { ticker: "AAPL", vendorSymbol: "AAPL.US" }, [{ date: "2026-10-23", value: 4e12 }, { date: "2026-10-30", value: 5e12 }]);
    await saveMarketCap(pool, { ticker: "AAPL", vendorSymbol: "AAPL.US" }, null);
    expect(await marketCapSeries("aapl", pool)).toEqual([{ date: "2026-10-23", value: 4e12 }, { date: "2026-10-30", value: 5e12 }]);
    expect((await pool.query("SELECT latest_week::text, status FROM market_cap_refresh WHERE vendor_symbol='AAPL.US'")).rows[0]).toEqual({ latest_week: "2026-10-30", status: "failed" });
  }), 60_000);
});
