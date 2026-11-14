import { afterEach, describe, expect, it } from "vitest";
import { etfCatalogDetail, etfCatalogList, etfRatingSummary, etfResearchCandidates, etfTopRated, normalizeCatalogFilters } from "./etf-catalog";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";
import { ETF_ASSET_CLASSES } from "./etf";
import { getEtfMessages } from "@/i18n/etf-messages";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { etfBand } from "@/engine/etf-bands";

// Minimal copies of the stats, holdings and bar tables the list reads (full DDL needs unrelated reference tables).
const STATS_TABLES = `CREATE TABLE etf_fund_stats (listing_key text, as_of date, total_assets numeric, total_assets_currency text, ongoing_charge_pct numeric, net_expense_ratio_pct numeric,
  category text, ret_1y_pct numeric, ret_3y_pct numeric, vol_1y_pct numeric, yield_pct numeric, holdings_count integer, PRIMARY KEY (listing_key, as_of));
  CREATE TABLE etf_holdings (listing_key text, position integer, weight_pct numeric, PRIMARY KEY (listing_key, position));
  CREATE TABLE asset_bars (vendor_symbol text, bar_date date, close numeric, PRIMARY KEY (vendor_symbol, bar_date));
  INSERT INTO asset_bars VALUES ('EURUSD.FOREX','2026-11-11',1.25),('EURUSD.FOREX','2026-11-12',1.25);`;
type Db = NonNullable<Parameters<typeof etfCatalogList>[1]>;
async function catalogDb(rows: string) {
  const db = new PGlite();
  await db.exec("CREATE TABLE etf_picks (symbol text, isin text, exchange text, last_seen_at timestamptz)");
  await db.exec(readFileSync("migrations/094_etf_catalog.sql", "utf8"));
  await db.exec(readFileSync("migrations/138_etf_scores.sql", "utf8"));
  await db.exec(readFileSync("migrations/141_etf_score_v3.sql", "utf8"));
  await db.exec(STATS_TABLES);
  await db.exec(rows);
  return { db, query: { query: (sql: string, values?: unknown[]) => db.query(sql, values) } as unknown as Db };
}

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
      await db.exec(readFileSync("migrations/141_etf_score_v3.sql", "utf8"));
      await db.exec(STATS_TABLES);
      await db.exec(`INSERT INTO etf_catalog(listing_key,name,instrument_type,exchange,first_seen,last_seen,enrichment_status,aum_usd_m,listing_region,trading_currency) VALUES
        ('rated-high','Z Rated high','ETF','XETR','2026-11-12','2026-11-12','pending',null,'EU','EUR'),
        ('rated-low','Y Rated low','ETF','XETR','2026-11-12','2026-11-12','ok',10,'EU','EUR'),
        ('rich-high','B Rich high','ETF','NASDAQ','2026-11-12','2026-11-12','ok',100,'US','USD'),
        ('rich-low','C Rich low','ETF','NASDAQ','2026-11-12','2026-11-12','ok',20,'US','USD'),
        ('empty','A Empty','ETF','XETR','2026-11-12','2026-11-12','pending',null,'EU','EUR')`);
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
      calls.push({ sql, values: [...values] });
      if (sql.includes("count(*)::text AS total")) return { rows: [{ total: "101", rated: "25", with_data: "50" }] };
      if (sql.includes("max(last_seen)")) return { rows: [{ size: "101", enriched: "50", shortlist: "8", last_sync: "2026-10-21" }] };
      if (sql.includes("asset_classes")) return { rows: [{ asset_classes: ["equity"], regions: [], listing_regions: ["EU", "US"], exchanges: ["NASDAQ", "XETR"], issuers: [], categories: null }] };
      return { rows: [] };
    } } as unknown as Db;
    const list = await etfCatalogList({ search: "TEST'; DROP TABLE etf_catalog; --", instrumentType: "all", page: "3", sort: "aum_desc", band: "mostlyMet", ter: "upTo020", aum: "from100to500" }, db);
    expect(list).toMatchObject({ total: 101, rated: 25, withData: 50, page: 3, pages: 3 });
    const count = calls.find((call) => call.sql.includes("count(*)::text AS total"));
    expect(count?.values).toEqual([ETF_RULES_VERSION, false, "TEST'; DROP TABLE etf_catalog; --", "mostlyMet", 0.2, 100, 500]);
    expect(count?.sql).toContain("s.state='rated'");
    const paged = calls.find((call) => call.sql.includes("LIMIT $8 OFFSET $9"));
    expect(paged?.values).toEqual([ETF_RULES_VERSION, false, "TEST'; DROP TABLE etf_catalog; --", "mostlyMet", 0.2, 100, 500, 50, 100]);
    expect(paged?.sql).not.toContain("DROP TABLE");
    expect(paged?.sql).toContain("round(s.earned::numeric / NULLIF(s.evidenced_max,0) * 100)");
    expect(paged?.sql).toContain("rules_version IN ($1,'etf-v2-2026-11-12') ORDER BY (rules_version=$1) DESC,as_of DESC LIMIT 1");
    expect(paged?.sql).toContain("st ON $2::boolean");
    // Without vendor access no holdings query runs and the category list stays empty.
    expect(calls.some((call) => call.sql.includes("etf_holdings"))).toBe(false);
    expect(list.options.categories).toEqual([]);
  });

  it("filters by band, evidence, TER, EUR AUM and category, and sorts by return, in SQL", async () => {
    process.env.DATA_MODE = "db";
    const { db, query } = await catalogDb(`INSERT INTO etf_catalog(listing_key,name,instrument_type,exchange,first_seen,last_seen,enrichment_status,aum_usd_m,ter_pct,listing_region,trading_currency,asset_class) VALUES
      ('full','Full evidence','ETF','XETR','2026-11-12','2026-11-12','ok',null,0.07,'EU','EUR','equity'),
      ('thin','Thin evidence','ETF','XETR','2026-11-12','2026-11-12','ok',null,0.20,'EU','EUR','equity'),
      ('us','US listing','ETF','NASDAQ','2026-11-12','2026-11-12','ok',250,0.03,'US','USD','equity'),
      ('few','Few met','ETF','XETR','2026-11-12','2026-11-12','ok',300,0.60,'EU','EUR','bond'),
      ('none','No score','ETF','XETR','2026-11-12','2026-11-12','pending',null,null,'EU','EUR',null);
      INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state) VALUES
      ('full','2026-11-13','${ETF_RULES_VERSION}','[]',80,90,'rated'),
      ('thin','2026-11-13','${ETF_RULES_VERSION}','[]',40,40,'rated'),
      ('us','2026-11-13','${ETF_RULES_VERSION}','[]',30,80,'rated'),
      ('few','2026-11-13','${ETF_RULES_VERSION}','[]',20,80,'rated');
      INSERT INTO etf_fund_stats VALUES
      ('full','2026-11-10',1500000000,'EUR',0.07,null,'Global Large-Cap Blend Equity',12.5,9.1,14.2,null,1500),
      ('thin','2026-11-10',800000000,null,0.19,null,'Global Large-Cap Blend Equity',3.2,null,11.0,null,90),
      ('few','2026-11-10',100000000,'USD',null,0.6,'EUR Government Bond',-1.5,0.5,5.0,2.1,40);
      INSERT INTO etf_holdings SELECT 'full', g, 2 FROM generate_series(1,12) g;`);
    try {
      const keys = async (filters: Parameters<typeof etfCatalogList>[0], vendor = true) => (await etfCatalogList(filters, query, { vendor })).funds.map((fund) => fund.listingKey);
      // Default order: band first (Incomplete data caps 100% at Mostly met), then percent, then evidenced points.
      expect(await keys({})).toEqual(["full", "thin", "us", "few", "none"]);
      expect(await keys({ band: "rulesMet" })).toEqual(["full"]);
      expect(await keys({ band: "mostlyMet" })).toEqual(["thin"]);
      expect(await keys({ band: "partlyMet" })).toEqual([]);
      expect(await keys({ band: "fewMet" })).toEqual(["us", "few"]);
      expect(await keys({ band: "notRated" })).toEqual(["none"]);
      expect(await keys({ evidence: "incomplete" })).toEqual(["thin"]);
      expect(await keys({ evidence: "full" })).toEqual(["full", "us", "few"]);
      // Stats TER wins over the catalog value with vendor access.
      expect(await keys({ ter: "upTo010" })).toEqual(["full", "us"]);
      expect(await keys({ ter: "over050" })).toEqual(["few"]);
      // EUR AUM: stated EUR, stated USD converted at 1.25, the catalog USD figure of a US USD listing; no currency is a gap.
      expect(await keys({ aum: "over1000" })).toEqual(["full"]);
      expect(await keys({ aum: "from100to500" })).toEqual(["us"]);
      expect(await keys({ aum: "under100" })).toEqual(["few"]);
      expect(await keys({ category: "EUR Government Bond" })).toEqual(["few"]);
      expect(await keys({ sort: "ret1y_desc" })).toEqual(["full", "thin", "few", "none", "us"]);
      expect(await keys({ sort: "aum_desc" })).toEqual(["full", "us", "few", "none", "thin"]);
      const list = await etfCatalogList({}, query, { vendor: true });
      expect(list.options.categories).toEqual(["EUR Government Bond", "Global Large-Cap Blend Equity"]);
      const facts = Object.fromEntries(list.funds.map((fund) => [fund.listingKey, fund.facts]));
      expect(facts.full).toMatchObject({ terPct: 0.07, aumEurM: 1500, aumGap: null, ret1yPct: 12.5, ret3yPct: 9.1, vol1yPct: 14.2, holdingsCount: 1500, topTenWeightPct: 20, category: "Global Large-Cap Blend Equity", statsAsOf: "2026-11-10" });
      expect(facts.thin).toMatchObject({ aumEurM: null, aumGap: "currency", topTenWeightPct: null });
      expect(facts.us).toMatchObject({ aumEurM: 200, aumGap: null });
      expect(facts.few).toMatchObject({ aumEurM: 80, terPct: 0.6, yieldPct: 2.1 });
      expect(facts.none).toMatchObject({ aumEurM: null, aumGap: "missing" });
      // Without vendor access the stats join is off: catalog TER, no return, no category filter or return sort.
      const plain = await etfCatalogList({ category: "EUR Government Bond", sort: "ret1y_desc" }, query, { vendor: false });
      expect(plain.total).toBe(5);
      expect(plain.funds.map((fund) => fund.listingKey)).toEqual(["full", "thin", "us", "few", "none"]);
      expect(plain.funds.every((fund) => fund.facts?.ret1yPct === null && fund.facts?.category === null && fund.facts?.topTenWeightPct === null)).toBe(true);
      expect(plain.funds.find((fund) => fund.listingKey === "thin")?.facts?.terPct).toBe(0.2);
      expect(plain.options.categories).toEqual([]);
    } finally { await db.close(); }
  }, 20_000);

  it("keeps the SQL band equal to etfBand at every boundary", async () => {
    process.env.DATA_MODE = "db";
    const cases: [number, number][] = [];
    for (const evidenced of [40, 69, 70, 100]) for (const percent of [0, 47, 48, 59, 60, 71, 72, 100]) cases.push([Math.round(percent * evidenced / 100), evidenced]);
    const { db, query } = await catalogDb(cases.map(([earned, evidenced], i) => `INSERT INTO etf_catalog(listing_key,name,instrument_type,exchange,first_seen,last_seen) VALUES ('k${i}','Fund ${i}','ETF','XETR','2026-11-12','2026-11-12');
      INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state) VALUES ('k${i}','2026-11-13','${ETF_RULES_VERSION}','[]',${earned},${evidenced},'rated');`).join("\n"));
    try {
      const expected = new Map<string, string[]>();
      cases.forEach(([earned, evidenced], i) => { const band = etfBand(Math.round(earned / evidenced * 100), evidenced).band; expected.set(band, [...expected.get(band) ?? [], `k${i}`]); });
      for (const band of ["rulesMet", "mostlyMet", "partlyMet", "fewMet"]) {
        const keys = (await etfCatalogList({ band }, query)).funds.map((fund) => fund.listingKey).sort();
        expect(keys, band).toEqual((expected.get(band) ?? []).sort());
      }
      const summary = await etfRatingSummary(query);
      expect(summary).toMatchObject({ asOf: "2026-11-13", inScope: cases.length, rated: cases.length, notRated: 0, incomplete: cases.filter(([, evidenced]) => evidenced < 70).length });
      for (const band of ["rulesMet", "mostlyMet", "partlyMet", "fewMet"] as const) expect(summary.bands[band], band).toBe(expected.get(band)?.length ?? 0);
    } finally { await db.close(); }
  }, 20_000);

  it("lists the highest rated funds per asset class by band, percent and evidence", async () => {
    process.env.DATA_MODE = "db";
    const rule = (group: string) => `{"id":"${group}","group":"${group}","max":10,"earned":5,"evidenced":true}`;
    const { db, query } = await catalogDb(`INSERT INTO etf_catalog(listing_key,name,instrument_type,exchange,first_seen,last_seen,asset_class,ter_pct) VALUES
      ('a','Thin hundred','ETF','XETR','2026-11-12','2026-11-12','equity',0.1),
      ('b','Broad ninety','ETF','XETR','2026-11-12','2026-11-12','equity',0.2),
      ('c','Broad ninety more evidence','ETF','XETR','2026-11-12','2026-11-12','equity',0.3),
      ('d','Bond fund','ETF','XETR','2026-11-12','2026-11-12','bond',0.15),
      ('e','Old run','ETF','XETR','2026-11-12','2026-11-12','bond',0.15),
      ('f','Note','ETN','XETR','2026-11-12','2026-11-12','equity',0.1);
      INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state) VALUES
      ('a','2026-11-13','${ETF_RULES_VERSION}','[${rule("cost")}]',40,40,'rated'),
      ('b','2026-11-13','${ETF_RULES_VERSION}','[${rule("cost")},${rule("size")},${rule("income")}]',72,80,'rated'),
      ('c','2026-11-13','${ETF_RULES_VERSION}','[${rule("cost")},${rule("size")}]',81,90,'rated'),
      ('d','2026-11-13','${ETF_RULES_VERSION}','[]',30,80,'rated'),
      ('e','2026-11-12','${ETF_RULES_VERSION}','[]',80,80,'rated'),
      ('f','2026-11-13','${ETF_RULES_VERSION}','[]',90,90,'rated');`);
    try {
      const top = await etfTopRated(5, query);
      expect(top.groups.map((group) => [group.assetClass, group.funds.map((fund) => fund.listingKey)])).toEqual([["equity", ["c", "b", "a"]], ["bond", ["d"]]]);
      expect(top.groups[0].funds[0]).toMatchObject({ percent: 90, band: "rulesMet", incompleteData: false, groupsWithData: 2, applicableGroups: 7, terPct: 0.3 });
      expect(top.groups[0].funds[1]).toMatchObject({ groupsWithData: 3, applicableGroups: 8 });
      expect(top.groups[0].funds[2]).toMatchObject({ percent: 100, band: "mostlyMet", incompleteData: true });
      expect((await etfTopRated(1, query)).groups[0].funds.map((fund) => fund.listingKey)).toEqual(["c"]);
    } finally { await db.close(); }
  }, 20_000);

  it("hands the research runner the highest rated recent ETFs with their rating context", async () => {
    const { db, query } = await catalogDb(`INSERT INTO etf_catalog(listing_key,name,mnemonic,instrument_type,exchange,first_seen,last_seen,asset_class,ter_pct,aum_usd_m) VALUES
      ('a','Alpha','AAA','ETF','XETR','2026-11-12',CURRENT_DATE,'equity',0.1,null),
      ('b','Beta','BBB','ETF','XETR','2026-11-12',CURRENT_DATE,'bond',0.2,50),
      ('stale','Stale','SSS','ETF','XETR','2026-01-01','2026-01-01','equity',0.1,null),
      ('etc','Gold','GLD','ETC','XETR','2026-11-12',CURRENT_DATE,'commodity',0.1,null),
      ('weak','Weak','WWW','ETF','XETR','2026-11-12',CURRENT_DATE,'equity',0.5,null);
      INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state) VALUES
      ('a','2026-11-13','${ETF_RULES_VERSION}','[]',70,90,'rated'),('b','2026-11-13','${ETF_RULES_VERSION}','[]',40,40,'rated'),
      ('stale','2026-11-13','${ETF_RULES_VERSION}','[]',90,90,'rated'),('etc','2026-11-13','${ETF_RULES_VERSION}','[]',90,90,'rated'),
      ('weak','2026-11-13','${ETF_RULES_VERSION}','[]',10,90,'rated');`);
    try {
      const items = await etfResearchCandidates(25, query as never);
      expect(items.map((item) => item.listingKey)).toEqual(["a", "b", "weak"]);
      expect(items[0]).toMatchObject({ symbol: "AAA", exchange: "XETR", terPct: 0.1, aumUsdM: null, ratingPercent: 78, ratingBand: "rulesMet", ratingIncompleteData: false, evidencedPoints: 90, ratingAsOf: "2026-11-13" });
      expect(items[1]).toMatchObject({ ratingPercent: 100, ratingBand: "mostlyMet", ratingIncompleteData: true, aumUsdM: 50 });
      expect((await etfResearchCandidates(1, query as never)).map((item) => item.listingKey)).toEqual(["a"]);
      expect((await etfResearchCandidates(9999, query as never)).length).toBe(3);
    } finally { await db.close(); }
  }, 20_000);

  it("drops vendor-only filters and sorts without vendor access", () => {
    expect(normalizeCatalogFilters({ category: "Equity", sort: "ret1y_desc" })).toMatchObject({ category: null, sort: "rating", vendor: false });
    expect(normalizeCatalogFilters({ category: "Equity", sort: "ret3y_desc" }, { vendor: true })).toMatchObject({ category: "Equity", sort: "ret3y_desc", vendor: true });
    expect(normalizeCatalogFilters({ band: "best", ter: "0.1", aum: "huge", evidence: "some" })).toMatchObject({ band: null, ter: null, aum: null, evidence: null });
    expect(normalizeCatalogFilters({ band: "notRated", ter: "over050", aum: "under100", evidence: "full" })).toMatchObject({ band: "notRated", ter: "over050", aum: "under100", evidence: "full" });
  });

  it("summarises sample bands and keeps sample facts behind vendor access", async () => {
    process.env.DATA_MODE = "fixture";
    expect(await etfRatingSummary(null)).toMatchObject({ rated: 3, inScope: 38, notRated: 35, incomplete: 3, bands: { rulesMet: 0, mostlyMet: 3, partlyMet: 0, fewMet: 0 }, sample: true });
    const top = await etfTopRated(5, null);
    expect(top.groups.flatMap((group) => group.funds.map((fund) => fund.listingKey)).sort()).toEqual(["DE0000000001", "DE0000000002", "DE0000000003"]);
    expect((await etfCatalogList({ band: "mostlyMet" }, null)).total).toBe(3);
    expect((await etfCatalogList({ band: "notRated" }, null)).total).toBe(35);
    const plain = await etfCatalogList({}, null);
    expect(plain.funds.every((fund) => fund.facts?.ret1yPct === null)).toBe(true);
    const vendor = await etfCatalogList({ sort: "ret1y_desc" }, null, { vendor: true });
    const returns = vendor.funds.map((fund) => fund.facts?.ret1yPct).filter((value): value is number => value !== null && value !== undefined);
    expect(returns).toEqual([...returns].sort((a, b) => b - a));
    expect(vendor.options.categories.length).toBeGreaterThan(0);
  });

  it("normalizes untrusted page, sort and instrument filters", () => {
    expect(normalizeCatalogFilters({ page: "-4", sort: "DROP TABLE", instrumentType: "bogus" })).toMatchObject({ page: 1, sort: "rating", instrumentType: null });
    expect(normalizeCatalogFilters({ page: "2", instrumentType: "all" })).toMatchObject({ page: 2, sort: "rating", instrumentType: "all" });
    // Every stored asset class, including money market, is a valid filter with a label in both locales.
    for (const assetClass of ETF_ASSET_CLASSES) {
      expect(normalizeCatalogFilters({ assetClass }).assetClass).toBe(assetClass);
      for (const locale of ["en", "sk"] as const) expect(getEtfMessages(locale)[assetClass]).toBeTruthy();
    }
    expect(ETF_ASSET_CLASSES).toContain("money_market");
    expect(normalizeCatalogFilters({ assetClass: "cash" }).assetClass).toBeNull();
  });
});
