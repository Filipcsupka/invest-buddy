import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { latestEtfScores, storeEtfScore } from "./etf-score";
import type { EtfScoreResult } from "@/engine/etf-score";
import { etfScoreStatus } from "@/engine/etf-score";

it("enforces score bounds and replaces a daily result atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE etf_catalog (listing_key text PRIMARY KEY); INSERT INTO etf_catalog VALUES ('TEST')");
    await db.exec(readFileSync("migrations/138_etf_scores.sql", "utf8"));
    await db.exec(readFileSync("migrations/141_etf_score_v3.sql", "utf8"));
    await db.exec(readFileSync("migrations/141_etf_score_v3.sql", "utf8"));
    const score: EtfScoreResult = { rulesVersion: "test", rules: [], earned: 10, evidencedMax: 20, percent: null, state: "not_rated", rejections: ["insufficient_evidence"], concentration: { concentrated: false, topTenWeightPct: null, maxCountryWeightPct: null, maxSectorWeightPct: null, holdingsCount: null } };
    const query = { query: (sql: string, values?: unknown[]) => db.query(sql, values) };
    await storeEtfScore("TEST", "2026-11-12", score, query as never);
    await storeEtfScore("TEST", "2026-11-12", { ...score, earned: 15 }, query as never);
    expect((await db.query("SELECT earned,evidenced_max FROM etf_scores")).rows).toEqual([{ earned: 15, evidenced_max: 20 }]);
    await expect(storeEtfScore("TEST", "2026-11-12", { ...score, earned: 21 }, query as never)).rejects.toThrow(/check constraint/i);
    expect((await db.query("SELECT earned FROM etf_scores")).rows).toEqual([{ earned: 15 }]);
    await storeEtfScore("TEST", "2026-11-13", { ...score, earned: 85, evidencedMax: 100, rules: [{ id: "ter", group: "cost", max: 12, earned: 12, evidenced: true, threshold: "≤0.10%", value: 0.1, date: "2026-11-13" }] }, query as never);
    expect((await db.query<{ rule_hits: EtfScoreResult["rules"] }>("SELECT rule_hits FROM etf_scores WHERE as_of='2026-11-13'")).rows[0].rule_hits[0]).toMatchObject({ value: 0.1, earned: 12 });
    await expect(storeEtfScore("TEST", "2026-11-13", { ...score, earned: 101, evidencedMax: 101 }, query as never)).rejects.toThrow(/check constraint/i);
    await expect(storeEtfScore("UNKNOWN", "2026-11-12", score, query as never)).rejects.toThrow(/foreign key/i);
  } finally { await db.close(); }
}, 15_000);

it("reads optional category defensively and batches wrapper, risk, exposure and bar facts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE etf_catalog (listing_key text PRIMARY KEY, instrument_type text, name text, last_seen date, listing_region text, trading_currency text, asset_class text, region text, ter_pct numeric, aum_usd_m numeric, replication text, ucits boolean, domicile text, tracked_index text, distribution text, theme text);
      CREATE TABLE etf_tracked (listing_key text, vendor_symbol text, detail_status text, dividends_fetched_at timestamptz);
      CREATE TABLE etf_fund_stats (listing_key text, as_of date, ongoing_charge_pct numeric, net_expense_ratio_pct numeric, total_assets numeric, total_assets_currency text, inception_date date, vol_1y_pct numeric, sharpe_3y numeric, ret_ytd_pct numeric, ret_1y_pct numeric, ret_3y_pct numeric, ret_5y_pct numeric, ret_10y_pct numeric, holdings_count int, holdings_listed int, yield_pct numeric, dividend_frequency text, payload jsonb);
      CREATE TABLE etf_holdings (listing_key text, as_of date, weight_pct numeric, country text);
      CREATE TABLE etf_exposure (listing_key text, as_of date, kind text, label text, weight_pct numeric);
      CREATE TABLE etf_dividends (vendor_symbol text, ex_date date);
      CREATE TABLE asset_bars (vendor_symbol text, bar_date date, close numeric, high numeric, low numeric, volume numeric, currency text);
      INSERT INTO etf_catalog VALUES ('X','ETF','Plain','2026-11-12','EU','EUR','equity','Europe',0.2,NULL,'physical',true,'IE','STOXX50E','dist',NULL);
      INSERT INTO etf_tracked VALUES ('X','X.DE','ok',now());
      INSERT INTO etf_fund_stats VALUES ('X','2026-11-12',0.2,NULL,100000000,'EUR','2020-01-01',14,1,5,12,33,55,70,200,200,1.5,'quarterly','{}');
      INSERT INTO etf_exposure VALUES ('X','2026-11-12','region','United States',60),('X','2026-11-12','sector','Technology',25);
      INSERT INTO etf_dividends VALUES ('X.DE','2026-01-01'),('X.DE','2026-04-01'),('X.DE','2026-07-01'),('X.DE','2026-10-01');`);
    const query = { query: (sql: string, values?: unknown[]) => db.query(sql, values) };
    const { readEtfScoreFactsBatch } = await import("./etf-score");
    const facts = (await readEtfScoreFactsBatch(["X"], "2026-11-12", query as never)).get("X");
    expect(facts).toMatchObject({ category: null, ucitsConfirmed: null, vol1yPct: 14, sharpe3y: 1, ret1yPct: 12, ret3yPct: 33, dividendsLast12m: 4, maxSectorWeightPct: 25, aumEur: 100000000 });
  } finally { await db.close(); }
});

it("ranks TER within five class and region peers when category is absent", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE etf_catalog (listing_key text PRIMARY KEY, instrument_type text, asset_class text, region text, listing_region text, ter_pct numeric);
      CREATE TABLE etf_fund_stats (listing_key text, as_of date, ongoing_charge_pct numeric, net_expense_ratio_pct numeric);
      INSERT INTO etf_catalog VALUES ('A','ETF','equity','Europe','EU',0.1),('B','ETF','equity','Europe','EU',0.2),('C','ETF','equity','Europe','EU',0.3),('D','ETF','equity','Europe','EU',0.4),('E','ETF','equity','Europe','EU',0.5),('X','ETF','bond','Europe','EU',0.1);`);
    const { loadEtfPeerPercentiles } = await import("./etf-score");
    const peers = await loadEtfPeerPercentiles("2026-11-12", { query: (sql: string, values?: unknown[]) => db.query(sql, values) } as never);
    expect(peers.get("A")).toBe(20);
    expect(peers.get("E")).toBe(100);
    expect(peers.has("X")).toBe(false);
  } finally { await db.close(); }
});

it("keeps v2 ratings visible until each listing has a v3 row", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE etf_catalog (listing_key text PRIMARY KEY); INSERT INTO etf_catalog VALUES ('A'),('B')");
    await db.exec(readFileSync("migrations/138_etf_scores.sql", "utf8"));
    await db.exec(readFileSync("migrations/141_etf_score_v3.sql", "utf8"));
    await db.exec(`INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state) VALUES
      ('A','2026-11-12','etf-v2-2026-11-12','[]',28,35,'rated'),
      ('B','2026-11-12','etf-v2-2026-11-12','[]',28,35,'rated'),
      ('B','2026-11-11','etf-v3-2026-11-13','[]',70,80,'rated')`);
    const scores = await latestEtfScores(["A", "B"], { query: (sql: string, values?: unknown[]) => db.query(sql, values) } as never);
    expect(scores.get("A")?.rulesVersion).toBe("etf-v2-2026-11-12");
    expect(scores.get("A")?.incompleteData).toBe(false);
    expect(etfScoreStatus(scores.get("A")!)).toBe("rulesMet");
    expect(scores.get("B")?.rulesVersion).toBe("etf-v3-2026-11-13");
  } finally { await db.close(); }
});
