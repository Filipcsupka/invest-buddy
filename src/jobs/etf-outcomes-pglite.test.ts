import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { materialiseEtfOutcomes } from "./etf-outcomes";

it("writes 30, 60 and 90 day non-US outcomes from stored ETF and index bars", async () => {
  const db = new PGlite();
  try {
    const dir = join(process.cwd(), "migrations");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    }
    await db.query(`INSERT INTO etf_catalog
      (listing_key,isin,mnemonic,name,instrument_type,exchange,listing_region,trading_currency,first_seen,last_seen)
      VALUES ('IE00B4L5Y983','IE00B4L5Y983','EUNL','World fund','ETF','XETR','EU','EUR','2025-01-01','2026-01-01')`);
    await db.query(`INSERT INTO tracked_assets (vendor_symbol,asset_class,name,currency,exchange)
      VALUES ('EUNL.XETRA','etf','World fund','EUR','XETRA')`);
    await db.query(`INSERT INTO etf_tracked (listing_key,vendor_symbol) VALUES ('IE00B4L5Y983','EUNL.XETRA')`);
    await db.query(`INSERT INTO etf_picks
      (symbol,exchange,name,asset_class,region,call,first_seen_at,last_seen_at,entry_price,entry_date,price_currency,listing_key)
      VALUES ('EUNL','XETR','World fund','equity','Europe','BUY_ZONE','2026-01-01','2026-01-01',100,'2026-01-01','EUR','IE00B4L5Y983')`);
    for (const [date, fund, index] of [
      ["2026-01-02", 100, 1000], ["2026-02-02", 110, 1050],
      ["2026-03-03", 120, 1100], ["2026-04-03", 130, 1150],
    ] as const) {
      await db.query("INSERT INTO asset_bars (vendor_symbol,bar_date,close) VALUES ($1,$2,$3),($4,$2,$5)",
        ["EUNL.XETRA", date, fund, "STOXX50E.INDX", index]);
    }

    expect(await materialiseEtfOutcomes(db as never, "2026-04-10")).toEqual({ completed: 3, written: 3 });
    const rows = await db.query<{ horizon_days: number; return_pct: string; benchmark_symbol: string; benchmark_return_pct: string; excess_pct: string }>(
      "SELECT horizon_days,return_pct::text,benchmark_symbol,benchmark_return_pct::text,excess_pct::text FROM etf_outcomes ORDER BY horizon_days");
    expect(rows.rows.map((row) => ({
      horizon: row.horizon_days, fund: Number(row.return_pct), benchmark: row.benchmark_symbol,
      benchmarkReturn: Number(row.benchmark_return_pct), excess: Number(row.excess_pct),
    }))).toEqual([
      { horizon: 30, fund: 10, benchmark: "STOXX50E.INDX", benchmarkReturn: 5, excess: 5 },
      { horizon: 60, fund: 20, benchmark: "STOXX50E.INDX", benchmarkReturn: 10, excess: 10 },
      { horizon: 90, fund: 30, benchmark: "STOXX50E.INDX", benchmarkReturn: 15, excess: 15 },
    ]);
    expect(await materialiseEtfOutcomes(db as never, "2026-04-10")).toEqual({ completed: 3, written: 0 });
  } finally { await db.close(); }
}, 60_000);
