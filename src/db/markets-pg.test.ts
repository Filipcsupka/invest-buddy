import pg from "pg";
import { describe, expect, it } from "vitest";
import { assetDetail, assetSummaries, componentsDue, indexComponents, saveComponents } from "./markets";
import { latestScreenerRuns, mapScreenerRows, saveScreenerRun, screenerResults } from "./screener";
import { SCREENER_PRESETS } from "./screener-presets";
import { marketCapSeries, saveMarketCap } from "./market-cap";

/** One connection, so BEGIN and ROLLBACK wrap every write. Needs a migrated TEST_DATABASE_URL (CI runs migrations first). */
async function inRollback(fn: (pool: pg.Pool) => Promise<void>) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try { await pool.query("BEGIN"); await fn(pool); } finally { await pool.query("ROLLBACK"); await pool.end(); }
}

describe("market view tables (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("summarizes stored bars with the prior-year base and reads a detail", () => inRollback(async (pool) => {
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
  }));
  it.skipIf(!process.env.TEST_DATABASE_URL)("replaces a day's constituents and tracks attempts", () => inRollback(async (pool) => {
    await saveComponents(pool, "GSPC.INDX", "2026-11-08", [{ code: "AIZ", exchange: "US", name: "Assurant", sector: null, industry: null, weight: 0.0002 }, { code: "OLD", exchange: "US", name: null, sector: null, industry: null, weight: null }]);
    await saveComponents(pool, "GSPC.INDX", "2026-11-08", [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: null, industry: null, weight: 0.0003 }]);
    await saveComponents(pool, "VIX.INDX", "2026-11-08", []);
    const stored = await indexComponents("GSPC.INDX", pool);
    expect(stored).toEqual({ asOf: "2026-11-08", rows: [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: null, industry: null, weight: 0.0003 }] });
    const due = await componentsDue(pool, "2000-01-01");
    expect(due).not.toContain("GSPC.INDX");
    expect(due).not.toContain("VIX.INDX");
    expect(await componentsDue(pool, "2999-01-01", ["GSPC.INDX"])).toEqual(["GSPC.INDX"]);
  }));
  it.skipIf(!process.env.TEST_DATABASE_URL)("stores screener runs idempotently and market cap points", () => inRollback(async (pool) => {
    const rows = mapScreenerRows([{ code: "AAPL", exchange: "US", name: "Apple Inc.", adjusted_close: 342.37, refund_1d_p: -0.52, market_capitalization: 5001541320704, dividend_yield: 0.003 }]);
    await saveScreenerRun(pool, SCREENER_PRESETS[0], "2026-11-07", rows);
    await saveScreenerRun(pool, SCREENER_PRESETS[0], "2026-11-07", rows);
    expect(await latestScreenerRuns(pool)).toContainEqual({ preset: "us-mega-cap", asOf: "2026-11-07", rowCount: 1 });
    expect((await screenerResults("us-mega-cap", pool)).rows).toEqual(rows);
    await saveMarketCap(pool, { ticker: "AAPL", vendorSymbol: "AAPL.US" }, [{ date: "2026-10-23", value: 4e12 }, { date: "2026-10-30", value: 5e12 }]);
    await saveMarketCap(pool, { ticker: "AAPL", vendorSymbol: "AAPL.US" }, null);
    expect(await marketCapSeries("aapl", pool)).toEqual([{ date: "2026-10-23", value: 4e12 }, { date: "2026-10-30", value: 5e12 }]);
    expect((await pool.query("SELECT latest_week::text, status FROM market_cap_refresh WHERE vendor_symbol='AAPL.US'")).rows[0]).toEqual({ latest_week: "2026-10-30", status: "failed" });
  }));
});
