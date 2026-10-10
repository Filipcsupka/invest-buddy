import pg from "pg";
import { describe, expect, it } from "vitest";
import { fundamentalsHistory, scoreHistory, universeAsOf } from "./history";

/** One connection, so BEGIN and ROLLBACK wrap the seed rows. Needs a migrated TEST_DATABASE_URL. */
async function inRollback(fn: (pool: pg.Pool) => Promise<void>) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try { await pool.query("BEGIN"); await fn(pool); } finally { await pool.query("ROLLBACK"); await pool.end(); }
}

describe("history read model (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("trims by depth, pages, and hides internal fields", () => inRollback(async (pool) => {
    await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('HZ1','h','t',1,'guide')");
    await pool.query(`INSERT INTO score_results (ticker,as_of,technical,fundamentals,macro,total,state,audit)
      SELECT 'HZ1', (DATE '2026-10-10' - g), 5, 4, 3, 12, 'Watch', '{"secret":"vendor"}' FROM generate_series(0, 59) g`);
    const all = await scoreHistory(pool, "HZ1", { limit: 500 });
    expect(all.rows).toHaveLength(60);
    expect(Object.keys(all.rows[0]).sort()).toEqual(["asOf", "fundamentals", "macro", "state", "technical", "total"]);
    expect(all.rows[0].asOf).toBe("2026-10-10");
    const trimmed = await scoreHistory(pool, "HZ1", { tierLimitDays: 30, today: "2026-10-10", limit: 500 });
    expect(trimmed.rows).toHaveLength(31);
    expect(trimmed.rows.at(-1)?.asOf).toBe("2026-09-10");
    const seen: string[] = [];
    let cursor: string | null = null;
    do { const p = await scoreHistory(pool, "HZ1", { limit: 25, cursor }); seen.push(...p.rows.map((r) => r.asOf)); cursor = p.nextCursor; } while (cursor);
    expect(seen).toEqual(all.rows.map((r) => r.asOf));
    expect((await scoreHistory(pool, "HZ1", { from: "2026-10-01", to: "2026-10-03" })).rows.map((r) => r.asOf)).toEqual(["2026-10-03", "2026-10-02", "2026-10-01"]);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("fundamentals: pages through restated facts and follows the sec display flag", () => inRollback(async (pool) => {
    await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('HZ2','h','t',1,'guide')");
    await pool.query(`INSERT INTO fundamentals_pit (ticker,concept,taxonomy,unit,period_end,fy,fp,form,filed,accession,value)
      VALUES ('HZ2','Revenues','us-gaap','USD','2026-06-30',2026,'Q2','10-Q','2026-08-01','a1',100),
             ('HZ2','Revenues','us-gaap','USD','2026-06-30',2026,'Q2','10-Q/A','2026-09-01','a2',101),
             ('HZ2','Revenues','us-gaap','USD','2026-03-31',2026,'Q1','10-Q','2026-05-01','a0',90),
             ('HZ2','NetIncomeLoss','us-gaap','USD','2026-06-30',2026,'Q2','10-Q','2026-08-01','a1',5)`);
    const first = await fundamentalsHistory(pool, "HZ2", "Revenues", { limit: 2 });
    expect(first.rows.map((r) => [r.accession, r.value])).toEqual([["a2", 101], ["a1", 100]]);
    expect(first.rows[0]).not.toHaveProperty("firstSeenAt");
    const second = await fundamentalsHistory(pool, "HZ2", "Revenues", { limit: 2, cursor: first.nextCursor });
    expect(second.rows.map((r) => r.accession)).toEqual(["a0"]);
    expect(second.nextCursor).toBeNull();
    expect((await fundamentalsHistory(pool, "HZ2", "Revenues", { tierLimitDays: 60, today: "2026-10-10" })).rows.map((r) => r.accession)).toEqual(["a2"]);
    await pool.query("UPDATE data_sources SET display_allowed=false WHERE id='sec'");
    expect((await fundamentalsHistory(pool, "HZ2", "Revenues")).rows).toEqual([]);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("universeAsOf applies half-open dates and hides reasons", () => inRollback(async (pool) => {
    await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('HZ3','h','t',1,'guide'),('HZ4','h','t',2,'guide')");
    await pool.query(`INSERT INTO universe_membership (ticker,list,tier,valid_from,valid_to,reason,criteria_version,added_by)
      VALUES ('HZ3','core',1,'2026-01-01','2026-06-01','r','v','x'),('HZ4','extended',2,'2026-06-01',NULL,'r','v','x')`);
    const names = async (d: string) => (await universeAsOf(pool, d, { limit: 500 })).rows.map((r) => r.ticker).filter((t) => t.startsWith("HZ"));
    expect(await names("2026-05-31")).toEqual(["HZ3"]);
    expect(await names("2026-06-01")).toEqual(["HZ4"]);
    const row = (await universeAsOf(pool, "2026-06-01", { limit: 500 })).rows.find((r) => r.ticker === "HZ4");
    expect(row).toEqual({ ticker: "HZ4", list: "extended", tier: 2, validFrom: "2026-06-01" });
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("plans use indexes on 300 names by 90 days", () => inRollback(async (pool) => {
    await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) SELECT 'HP'||g,'h','t',1,'guide' FROM generate_series(1,300) g");
    await pool.query(`INSERT INTO score_results (ticker,as_of,technical,fundamentals,macro,total,state,audit)
      SELECT 'HP'||t, (DATE '2026-10-10' - d), 5, 4, 3, 12, 'Watch', '{}' FROM generate_series(1,300) t, generate_series(0,89) d`);
    await pool.query(`INSERT INTO fundamentals_pit (ticker,concept,taxonomy,unit,period_end,form,filed,accession,value)
      SELECT 'HP'||t,'Revenues','us-gaap','USD', DATE '2026-06-30' - (q*90), '10-Q', DATE '2026-08-01' - (q*90), 'acc'||t||'-'||q, q FROM generate_series(1,300) t, generate_series(0,9) q`);
    await pool.query("ANALYZE score_results"); await pool.query("ANALYZE fundamentals_pit");
    const plan = async (sql: string, params: unknown[]) => JSON.stringify((await pool.query(`EXPLAIN (FORMAT JSON) ${sql}`, params)).rows[0]["QUERY PLAN"]);
    const score = await plan(`SELECT as_of::text, technical, fundamentals, macro, total, state FROM score_results WHERE ticker=$1 AND as_of >= $2::date ORDER BY as_of DESC LIMIT 101`, ["HP7", "2026-07-12"]);
    console.log("EXPLAIN score_results:", score);
    expect(score).toMatch(/Index/);
    expect(score).not.toMatch(/Seq Scan/);
    const fund = await plan(`SELECT * FROM fundamentals_pit WHERE ticker=$1 AND concept=$2 ORDER BY filed DESC, id DESC LIMIT 101`, ["HP7", "Revenues"]);
    console.log("EXPLAIN fundamentals_pit:", fund);
    expect(fund).toMatch(/Index/);
    expect(fund).not.toMatch(/Seq Scan on \\"?fundamentals_pit/);
  }));
});
