import { afterEach, describe, expect, it } from "vitest";
import { etfCatalogDetail, etfCatalogList, normalizeCatalogFilters } from "./etf-catalog";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

describe("ETF catalog read model", () => {
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
      if (sql.includes("count(*)::text AS total")) return { rows: [{ total: "101" }] };
      if (sql.includes("max(last_seen)")) return { rows: [{ size: "101", enriched: "50", shortlist: "8", last_sync: "2026-10-21" }] };
      if (sql.includes("asset_classes")) return { rows: [{ asset_classes: ["equity"], regions: [], listing_regions: ["EU", "US"], exchanges: ["NASDAQ", "XETR"], issuers: [] }] };
      return { rows: [] };
    } } as unknown as NonNullable<Parameters<typeof etfCatalogList>[1]>;
    const list = await etfCatalogList({ search: "TEST", instrumentType: "all", page: "3", sort: "aum_desc" }, db);
    expect(list).toMatchObject({ total: 101, page: 3, pages: 3 });
    const paged = calls.find((call) => call.sql.includes("LIMIT $13 OFFSET $14"));
    expect(paged?.values).toEqual(["TEST", null, null, null, null, null, "all", null, null, null, null, "aum_desc", 50, 100]);
    expect(paged?.sql).not.toContain("TEST");
  });

  it("normalizes untrusted page, sort and instrument filters", () => {
    expect(normalizeCatalogFilters({ page: "-4", sort: "DROP TABLE", instrumentType: "bogus" })).toMatchObject({ page: 1, sort: "name", instrumentType: null });
    expect(normalizeCatalogFilters({ page: "2", instrumentType: "all" })).toMatchObject({ page: 2, instrumentType: "all" });
  });
});
