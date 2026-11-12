import { afterEach, describe, expect, it } from "vitest";
import { etfCatalogDetail, etfCatalogList, normalizeCatalogFilters } from "./etf-catalog";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

describe("ETF catalog read model", () => {
  it("orders current rated scores, enriched AUM, then remaining names in SQL", async () => {
    process.env.DATA_MODE = "db";
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE etf_picks (symbol text, isin text, exchange text, last_seen_at timestamptz)");
      await db.exec(readFileSync("migrations/094_etf_catalog.sql", "utf8"));
      await db.exec(readFileSync("migrations/138_etf_scores.sql", "utf8"));
      await db.exec(`INSERT INTO etf_catalog(listing_key,name,instrument_type,exchange,first_seen,last_seen,enrichment_status,aum_usd_m) VALUES
        ('rated-high','Z Rated high','ETF','XETR','2026-11-12','2026-11-12','pending',null),
        ('rated-low','Y Rated low','ETF','XETR','2026-11-12','2026-11-12','ok',10),
        ('rich-high','B Rich high','ETF','XETR','2026-11-12','2026-11-12','ok',100),
        ('rich-low','C Rich low','ETF','XETR','2026-11-12','2026-11-12','ok',20),
        ('empty','A Empty','ETF','XETR','2026-11-12','2026-11-12','pending',null)`);
      await db.query(`INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state) VALUES
        ('rated-high','2026-11-10',$1,'[]',14,35,'rated'),
        ('rated-high','2026-11-12',$1,'[]',35,35,'rated'),
        ('rated-low','2026-11-12',$1,'[]',28,35,'rated'),
        ('empty','2026-11-12','old-rules','[]',35,35,'rated')`, [ETF_RULES_VERSION]);
      const query = { query: (sql: string, values?: unknown[]) => db.query(sql, values) };
      const list = await etfCatalogList({}, query as never);
      expect(list.funds.map((fund) => fund.listingKey)).toEqual(["rated-high", "rated-low", "rich-high", "rich-low", "empty"]);
      expect(list).toMatchObject({ total: 5, rated: 2, withData: 3 });
      expect((await etfCatalogList({ sort: "name" }, query as never)).funds.map((fund) => fund.listingKey)).toEqual(["empty", "rich-high", "rich-low", "rated-low", "rated-high"]);
    } finally { await db.close(); }
  });

  it("provides forty labelled sample funds and paginates filters", async () => {
    process.env.DATA_MODE = "fixture";
    const list = await etfCatalogList({}, null);
    expect(list.sample).toBe(true);
    expect(list.stats.size).toBe(40);
    expect(list.total).toBe(38);
    expect((await etfCatalogList({ instrumentType: "all" }, null)).total).toBe(40);
    expect((await etfCatalogList({ instrumentType: "ETC" }, null)).total).toBe(1);
    expect((await etfCatalogList({ listingRegion: "US" }, null)).total).toBe(20);
    expect((await etfCatalogDetail("NASDAQ:S021", null))?.fund.isin).toBeNull();
    expect(list.stats.shortlist).toBe(9);
    expect(list).toMatchObject({ rated: 3, withData: 34, total: 38 });
    expect(list.funds.slice(0, 3).map((fund) => fund.listingKey)).toEqual(["DE0000000002", "DE0000000001", "DE0000000003"]);
    const afterRatings = list.funds.slice(3);
    const enriched = afterRatings.filter((fund) => fund.enrichmentStatus === "ok");
    expect(enriched.map((fund) => fund.aumUsdM ?? -Infinity)).toEqual([...enriched.map((fund) => fund.aumUsdM ?? -Infinity)].sort((a, b) => b - a));
    expect(afterRatings.slice(enriched.length).map((fund) => fund.name)).toEqual([...afterRatings.slice(enriched.length).map((fund) => fund.name)].sort((a, b) => a.localeCompare(b)));
    expect(list.funds[0].name).toContain("sample");
    const detail = await etfCatalogDetail("DE0000000001", null);
    expect(detail?.fund.pickSymbol).toBe("VWRA");
    expect((await etfCatalogDetail("DE9999999999", null))).toBeNull();
    const selected = await etfCatalogList({ issuer: "Sample Asset Management", shortlist: "yes", enriched: "yes", sort: "ter_desc" }, null);
    expect(selected.funds.every((fund) => fund.issuer === "Sample Asset Management" && fund.shortlist && fund.enrichmentStatus === "ok")).toBe(true);
    expect(selected.funds.length).toBeGreaterThan(0);
    const none = await etfCatalogList({ search: "does-not-exist" }, null);
    expect(none.total).toBe(0);
  });

  it("uses bound filters and a fifty-row offset for database pagination", async () => {
    process.env.DATA_MODE = "db";
    const calls: { sql: string; values: unknown[] }[] = [];
    const db = { query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes("count(*)::text AS total")) return { rows: [{ total: "101", rated: "25", with_data: "50" }] };
      if (sql.includes("max(last_seen)")) return { rows: [{ size: "101", enriched: "50", shortlist: "8", last_sync: "2026-10-21" }] };
      if (sql.includes("asset_classes")) return { rows: [{ asset_classes: ["equity"], regions: [], listing_regions: ["EU", "US"], exchanges: ["NASDAQ", "XETR"], issuers: [] }] };
      return { rows: [] };
    } } as unknown as NonNullable<Parameters<typeof etfCatalogList>[1]>;
    const list = await etfCatalogList({ search: "TEST", instrumentType: "all", page: "3", sort: "aum_desc" }, db);
    expect(list).toMatchObject({ total: 101, rated: 25, withData: 50, page: 3, pages: 3 });
    const count = calls.find((call) => call.sql.includes("count(*)::text AS total"));
    expect(count?.values).toEqual(["TEST", null, null, null, null, null, "all", null, null, null, null, ETF_RULES_VERSION]);
    expect(count?.sql).toContain("s.state='rated'");
    const paged = calls.find((call) => call.sql.includes("LIMIT $14 OFFSET $15"));
    expect(paged?.values).toEqual(["TEST", null, null, null, null, null, "all", null, null, null, null, ETF_RULES_VERSION, "aum_desc", 50, 100]);
    expect(paged?.sql).not.toContain("TEST");
    expect(paged?.sql).toContain("ORDER BY CASE WHEN $13='rating'");
    expect(paged?.sql).toContain("round(s.earned::numeric / NULLIF(s.evidenced_max,0) * 100)");
    expect(paged?.sql).toContain("c.aum_usd_m END DESC NULLS LAST");
    expect(paged?.sql).toContain("rules_version=$12 ORDER BY as_of DESC LIMIT 1");
  });

  it("normalizes untrusted page, sort and instrument filters", () => {
    expect(normalizeCatalogFilters({ page: "-4", sort: "DROP TABLE", instrumentType: "bogus" })).toMatchObject({ page: 1, sort: "rating", instrumentType: null });
    expect(normalizeCatalogFilters({ page: "2", instrumentType: "all" })).toMatchObject({ page: 2, sort: "rating", instrumentType: "all" });
  });
});
