import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { ingestEnrichment, pendingCatalog, upsertCatalog, type Enrichment } from "../db/etf-catalog-ingest";
import type { CatalogListing } from "./etf-catalog-data";
import { parseRemapArgs, remapRow, runCatalogRemap, type RemapRow } from "./etf-catalog-remap";

async function migratedPool() {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  const query = (sql: string, params?: unknown[]) => db.query(sql, params);
  return { db, pool: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool };
}

const listing = (listingKey: string, ucits: boolean | null): CatalogListing => ({ listingKey, isin: listingKey, wkn: null, mnemonic: listingKey.slice(-4), name: `Fund ${listingKey}`, instrumentType: "ETF", exchange: "XETR", listingRegion: "EU", tradingCurrency: "EUR", ucits });
const enrichment = (listingKey: string, extra: Partial<Enrichment> = {}): Enrichment => ({ listingKey, isin: null, issuer: "Issuer", assetClass: "money_market", region: null, theme: null, trackedIndex: null, terPct: 0.1,
  aumUsdM: null, domicile: "IE", replication: null, distribution: null, ucits: null, sourceUrl: "https://eodhd.com/api/v1.1/fundamentals/X.XETRA", source: "eodhd", holdingsCount: 1, ...extra });

describe("ETF catalog mapping against the migrated schema (PGlite)", () => {
  it("migration 145 rewrites legacy regions once and leaves unique filter options", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE etf_catalog (listing_key text PRIMARY KEY, region text, updated_at timestamptz)");
      const names = ["North America", "United States", "United States and Canada", "Canada", "Europe Developed", "Developed Europe", "Denmark", "Finland", "Netherlands", "Eurozone", "Europe Emerging", "United Kingdom", "Japan", "Asia Developed", "Developed Asia Pacific ex-Japan", "Asia Emerging", "China", "Australasia", "Latin America", "Brazil", "Chile", "Africa/Middle East", "Israel", "global", "Global", "International", "Global ex United States", "Developed markets ex United States", "Developed markets excluding United States", "Developed markets excluding United States and Canada", "Developed markets ex-North America", "Emerging markets", "Emerging Markets"];
      for (const [i, name] of names.entries()) await db.query("INSERT INTO etf_catalog(listing_key,region) VALUES ($1,$2)", [String(i), name]);
      const migration = readFileSync("migrations/145_etf_catalog_regions.sql", "utf8");
      await db.exec(migration);
      const once = (await db.query<{ region: string }>("SELECT DISTINCT region FROM etf_catalog ORDER BY region")).rows.map((row) => row.region);
      expect(once).toEqual(["Africa/Middle East", "Asia Developed", "Asia Emerging", "Australasia", "Emerging Markets", "Europe Developed", "Europe Emerging", "Eurozone", "Global", "Global ex US", "Japan", "Latin America", "North America", "United Kingdom"]);
      await db.exec(migration);
      expect((await db.query<{ region: string }>("SELECT DISTINCT region FROM etf_catalog ORDER BY region")).rows.map((row) => row.region)).toEqual(once);
    } finally { await db.close(); }
  });

  it("keeps the Xetra UCITS hint and TER gap, and accepts money market end to end", async () => {
    const { db, pool } = await migratedPool();
    try {
      const today = new Date().toISOString().slice(0, 10);
      await upsertCatalog(pool, [listing("IE0000000011", true), listing("IE0000000029", null)], today);
      expect((await pendingCatalog(pool, 10)).map((row) => [row.listingKey, row.ucitsHint])).toEqual([["IE0000000011", true], ["IE0000000029", null]]);

      await ingestEnrichment(pool, [enrichment("IE0000000011", { ucitsHint: true, terPct: null, terGap: "ter_ambiguous" }), enrichment("IE0000000029")]);
      const rows = (await pool.query("SELECT listing_key,asset_class,ucits,ucits_hint,ter_gap FROM etf_catalog ORDER BY listing_key")).rows;
      expect(rows).toEqual([
        { listing_key: "IE0000000011", asset_class: "money_market", ucits: true, ucits_hint: true, ter_gap: "ter_ambiguous" },
        { listing_key: "IE0000000029", asset_class: "money_market", ucits: null, ucits_hint: null, ter_gap: null },
      ]);
      // The hint follows the Xetra file on every sync; an enriched row keeps its own ucits value.
      await upsertCatalog(pool, [listing("IE0000000029", true)], today);
      expect((await pool.query("SELECT enrichment_status,ucits,ucits_hint FROM etf_catalog WHERE listing_key='IE0000000029'")).rows[0]).toEqual({ enrichment_status: "ok", ucits: null, ucits_hint: true });

      await expect(pool.query("UPDATE etf_catalog SET ter_gap='other' WHERE listing_key='IE0000000011'")).rejects.toThrow();
      await pool.query(`INSERT INTO etf_picks (symbol,name,asset_class,call,first_seen_at,last_seen_at) VALUES ('MMF','Money market fund','money_market','WATCH',CURRENT_DATE,CURRENT_DATE)`);
      expect((await pool.query("SELECT asset_class FROM etf_picks")).rows).toEqual([{ asset_class: "money_market" }]);
    } finally { await db.close(); }
  });

  it("remaps enriched rows from both stored payload shapes, dry run first", async () => {
    const { db, pool } = await migratedPool();
    try {
      await pool.query(`INSERT INTO etf_catalog (listing_key,isin,mnemonic,name,instrument_type,exchange,listing_region,trading_currency,enrichment_status,enrichment_source,asset_class,region,distribution,first_seen,last_seen) VALUES
        ('IE00000000A1','IE00000000A1','OLD1','Old shape fund','ETF','XETR','EU','EUR','ok','eodhd','equity',NULL,NULL,CURRENT_DATE,CURRENT_DATE),
        ('IE00000000B2','IE00000000B2','NEW2','New shape fund','ETF','XETR','EU','EUR','ok','eodhd','other','Kept',NULL,CURRENT_DATE,CURRENT_DATE),
        ('IE00000000C3','IE00000000C3','COD3','Codex fund','ETF','XETR','EU','EUR','ok','codex','equity',NULL,NULL,CURRENT_DATE,CURRENT_DATE)`);
      const stats = `INSERT INTO etf_fund_stats (listing_key,as_of,vendor_symbol,origin,payload,fetched_at,source_id,display_allowed) VALUES ($1,CURRENT_DATE - 1,$2,'enrich',$3::jsonb,now(),'eodhd',false)`;
      // Before migration 140: bare ETF_Data, no General.
      await pool.query(stats, ["IE00000000A1", "OLD1.XETRA", JSON.stringify({ World_Regions: { "Europe Developed": { "Equity_%": 90 } }, Dividend_Paying_Frequency: "NA", Asset_Allocation: { "Stock non-US": { "Net_Assets_%": 99 } }, NetExpenseRatio: 0.02 })]);
      await pool.query(stats, ["IE00000000B2", "NEW2.XETRA", JSON.stringify({ General: { Category: "EUR Money Market" }, ETF_Data: { Dividend_Paying_Frequency: "Accumulating", Holdings: { "A.XETRA": { Code: "A" } } } })]);
      await pool.query(stats, ["IE00000000C3", "COD3.XETRA", JSON.stringify({ General: { Category: "Bond" }, ETF_Data: {} })]);
      await pool.query(`INSERT INTO tracked_assets (vendor_symbol,asset_class,name,currency,exchange,enabled,sort) VALUES ('OLD1.XETRA','etf','Old shape fund','EUR','XETRA',true,1)`);
      await pool.query(`INSERT INTO etf_dividends (vendor_symbol,ex_date,amount,source_id,display_allowed) VALUES ('OLD1.XETRA',CURRENT_DATE - 30,0.3,'eodhd',false)`);

      const lines: string[] = [];
      const dry = await runCatalogRemap(pool, { apply: false, limit: null }, (line) => lines.push(line));
      expect(dry).toMatchObject({ scanned: 2, changed: 2, assetClass: 1, region: 1, distribution: 2, terGap: 1, shortlist: null });
      expect(lines.join("\n")).toContain("IE00000000B2: assetClass other -> money_market, distribution null -> acc");
      expect((await pool.query("SELECT count(*)::int AS n FROM etf_catalog WHERE region IS NOT NULL")).rows[0]).toEqual({ n: 1 });

      const applied = await runCatalogRemap(pool, { apply: true, limit: null }, () => undefined);
      expect(applied).toMatchObject({ scanned: 2, changed: 2, applied: true });
      expect((await pool.query("SELECT listing_key,asset_class,region,distribution,ter_gap FROM etf_catalog ORDER BY listing_key")).rows).toEqual([
        { listing_key: "IE00000000A1", asset_class: "equity", region: "Europe Developed", distribution: "dist", ter_gap: "ter_ambiguous" },
        { listing_key: "IE00000000B2", asset_class: "money_market", region: "Kept", distribution: "acc", ter_gap: null },
        { listing_key: "IE00000000C3", asset_class: "equity", region: null, distribution: null, ter_gap: null },
      ]);
      expect(await runCatalogRemap(pool, { apply: true, limit: 1 }, () => undefined)).toMatchObject({ scanned: 1, changed: 0 });
    } finally { await db.close(); }
  });

  it("never erases a stored value with null and parses its options", () => {
    const row: RemapRow = { listingKey: "K", isin: null, name: "N", symbol: "S", exchange: "XETR", ucitsHint: null, assetClass: "bond", region: "Europe Developed", distribution: "dist", terGap: null,
      vendorSymbol: "S.XETRA", general: null, etfData: null, dividendHistory: [] };
    expect(remapRow(row).changes).toEqual({});
    expect(parseRemapArgs([])).toEqual({ apply: false, limit: null });
    expect(parseRemapArgs(["--apply", "--limit", "5"])).toEqual({ apply: true, limit: 5 });
    expect(() => parseRemapArgs(["--limit", "0"])).toThrow(/positive/);
    expect(() => parseRemapArgs(["--force"])).toThrow(/Usage/);
  });
});
