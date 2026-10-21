import pg from "pg";
import { describe, expect, it } from "vitest";
import { loadCandidates } from "./candidates";
import { failedCriterion, UNIVERSE_CRITERIA } from "./select";

/** One connection, so BEGIN and ROLLBACK wrap every insert. Needs a migrated TEST_DATABASE_URL. */
async function inRollback(fn: (pool: pg.Pool) => Promise<void>) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try { await pool.query("BEGIN"); await fn(pool); } finally { await pool.query("ROLLBACK"); await pool.end(); }
}

const asOf = "2026-10-21";
const days = (count: number, end = asOf) => Array.from({ length: count }, (_, index) =>
  new Date(Date.parse(`${end}T00:00:00Z`) - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10));

async function seed(db: pg.Pool) {
  await db.query(`INSERT INTO instruments (ticker,name,sector,tier,source) VALUES
    ('ZZUS','ZZ US Corp','Tech',NULL,'discovery'),('ZZH.LSE','ZZ Half PLC','Industrial',NULL,'discovery'),
    ('ZZG.LSE','ZZ Pound PLC','Industrial',NULL,'discovery'),('ZZN.XETRA','ZZ Neu AG','Industrial',NULL,'discovery')`);
  await db.query(`INSERT INTO symbols (vendor_symbol,code,exchange,name,currency,type,first_seen,last_seen) VALUES
    ('ZZH.LSE','ZZH','LSE','ZZ Half PLC','GBX','Common Stock','2026-01-01','2026-10-21'),
    ('ZZG.LSE','ZZG','LSE','ZZ Pound PLC','GBP','Common Stock','2026-01-01','2026-10-21'),
    ('ZZN.XETRA','ZZN','XETRA','ZZ Neu AG','EUR','Common Stock','2026-10-25','2026-10-25')`);
  const bars = (ticker: string, dates: string[], close: number, source: string, vendor: string | null, currency: string | null) => db.query(
    `INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume,source_id,vendor_symbol,currency)
     SELECT $1,d::date,$3,$3,$3,$3,1000000,$4,$5,$6 FROM unnest($2::text[]) d`, [ticker, dates, close, source, vendor, currency]);
  // ZZUS: 30 stored bars and 50 discovery bars; stored bars win on shared dates.
  await bars("ZZUS", days(30), 20, "twelvedata", "ZZUS", null);
  await db.query(`INSERT INTO discovery_price_bars (symbol,name,sector,bar_date,open,high,low,close,volume)
    SELECT s,'n','Tech',d::date,10,10,10,10,1000000 FROM unnest(ARRAY['ZZUS','ZZDISC']) s, unnest($1::text[]) d`, [days(50)]);
  await bars("ZZH.LSE", days(50), 2_000, "eodhd", "ZZH.LSE", "GBX");
  await bars("ZZG.LSE", days(50), 2_000, "eodhd", "ZZG.LSE", "GBP");
  await bars("ZZN.XETRA", days(50), 50, "eodhd", "ZZN.XETRA", "EUR");
  // Bars after the score date are never read.
  await bars("ZZH.LSE", ["2026-10-22", "2026-10-23"], 9_000, "eodhd", "ZZH.LSE", "GBX");
  const revenue = (ticker: string, start: string, end: string, value: number, seen = "2026-10-01") => db.query(
    `INSERT INTO fundamentals_pit (ticker,concept,taxonomy,unit,period_start,period_end,form,filed,accession,value,source_id,first_seen_at)
     VALUES ($1,'Revenues','eodhd','GBP',$2,$3,'EODHD',$6,$7,$4,'eodhd',$5)`,
    [ticker, start, end, value, seen, new Date(Date.parse(`${end}T00:00:00Z`) + 40 * 86_400_000).toISOString().slice(0, 10), `${ticker}:${end}`]);
  // Half-year reporter: H1 2025, H2 2025 and H1 2026.
  await revenue("ZZH.LSE", "2025-01-01", "2025-06-30", 100);
  await revenue("ZZH.LSE", "2025-07-01", "2025-12-31", 105);
  await revenue("ZZH.LSE", "2026-01-01", "2026-06-30", 120);
  // A restated H1 2026 first stored after the score date must not be read.
  await db.query(`INSERT INTO fundamentals_pit (ticker,concept,taxonomy,unit,period_start,period_end,form,filed,accession,value,source_id,first_seen_at)
    VALUES ('ZZH.LSE','Revenues','eodhd','GBP','2026-01-01','2026-06-30','EODHD','2026-08-15','late',500,'eodhd','2026-10-25')`);
  await db.query(`INSERT INTO fundamentals_pit (ticker,concept,taxonomy,unit,period_start,period_end,form,filed,accession,value,source_id,first_seen_at)
    VALUES ('ZZH.LSE','EntityCommonStockSharesOutstanding','eodhd','shares',NULL,'2026-06-30','EODHD','2026-08-10','shares',1000000000,'eodhd','2026-10-01')`);
  const fx = (series: string, date: string, value: number, observed: string) => db.query(
    `INSERT INTO macro_observations (series_id,obs_date,value,realtime_start,source_id,source_url,observed_at) VALUES ($1,$2,$3,$2,'ecb','test',$4)`, [series, date, value, observed]);
  await fx("ECB_EURUSD", "2026-10-20", 1.16, "2026-10-20T16:00:00Z");
  await fx("ECB_EURGBP", "2026-10-20", 0.87, "2026-10-20T16:00:00Z");
  await fx("ECB_EURUSD", "2026-10-22", 2, "2026-10-22T16:00:00Z");
  // Published for asOf but stored later: not known on asOf.
  await fx("ECB_EURGBP", "2026-10-21", 5, "2026-10-25T16:00:00Z");
}

describe("market candidate read model (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("reads point-in-time bars, revenue, shares and FX", () => inRollback(async (db) => {
    await seed(db);
    const rows = new Map((await loadCandidates(db, asOf)).map((row) => [row.ticker, row]));
    expect(rows.get("ZZUS")).toMatchObject({ exchange: "US", currency: "USD", barDays: 50, lastClose: 20 });
    expect(rows.get("ZZDISC")).toMatchObject({ exchange: "US", currency: "USD", barDays: 50, lastClose: 10 });
    const half = rows.get("ZZH.LSE")!;
    expect(half).toMatchObject({ exchange: "LSE", currency: "GBX", revenuePeriod: "half", revenueQuarters: 3, yoyGrowthPct: 20, lastClose: 2_000, barDays: 50 });
    expect(half.usdPerUnit).toBeCloseTo(1.16 / 0.87 / 100);
    expect(half.marketCapUsd).toBeCloseTo(2_000 * 1e9 * 1.16 / 0.87 / 100);
    expect(failedCriterion(half, UNIVERSE_CRITERIA)).toBeNull();
    expect(rows.get("ZZG.LSE")).toMatchObject({ currency: "GBP", listingIssue: "currency_unverified_gbx" });
    expect(rows.get("ZZN.XETRA")).toMatchObject({ exchange: "XETRA", currency: "", listingIssue: "listing_not_synced", barDays: 0 });
  }));
  it.skipIf(!process.env.TEST_DATABASE_URL)("marks a cross rate from two dates as stale", () => inRollback(async (db) => {
    await seed(db);
    await db.query("DELETE FROM macro_observations WHERE series_id='ECB_EURGBP' AND obs_date='2026-10-20'");
    await db.query(`INSERT INTO macro_observations (series_id,obs_date,value,realtime_start,source_id,source_url,observed_at)
      VALUES ('ECB_EURGBP','2026-10-19',0.87,'2026-10-19','ecb','test','2026-10-19T16:00:00Z')`);
    const half = (await loadCandidates(db, asOf)).find((row) => row.ticker === "ZZH.LSE")!;
    expect(half).toMatchObject({ usdPerUnit: null, fxIssue: "fx_stale", marketCapUsd: null });
    expect(failedCriterion(half, UNIVERSE_CRITERIA)).toBe("fx_stale");
  }));
});
