import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backdateUniverse, parseBackdate } from "./universe-backdate";

const base = ["--list", "extended", "--added-by", "e8-rollout", "--from", "2026-11-07", "--to", "2026-11-06", "--note", "baseline", "--actor", "owner"];

describe("universe-backdate arguments", () => {
  it("is a dry run unless --apply is given", () => {
    expect(parseBackdate(base).apply).toBe(false);
    expect(parseBackdate([...base, "--apply"]).apply).toBe(true);
  });
  it("limits the shift to one to seven days earlier", () => {
    expect(() => parseBackdate(base.map((value) => value === "2026-11-06" ? "2026-11-07" : value))).toThrow(/1 to 7 days/);
    expect(() => parseBackdate(base.map((value) => value === "2026-11-06" ? "2026-10-30" : value))).toThrow(/1 to 7 days/);
    expect(() => parseBackdate(base.map((value) => value === "2026-11-06" ? "2026-11-08" : value))).toThrow(/1 to 7 days/);
  });
  it("requires every option and rejects unknown ones", () => {
    expect(() => parseBackdate(base.slice(2))).toThrow(/Usage/);
    expect(() => parseBackdate([...base, "--list-all", "x"])).toThrow(/Unknown|Invalid/);
    expect(() => parseBackdate(base.map((value) => value === "2026-11-07" ? "2026-02-30" : value))).toThrow(/Usage/);
  });
});

async function migratedPool() {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  const query = (sql: string, params?: unknown[]) => db.query(sql, params);
  return { db, pool: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool };
}

describe("universe-backdate on PGlite", () => {
  let ctx: Awaited<ReturnType<typeof migratedPool>>;
  const members = (pool: pg.Pool) => pool.query<{ ticker: string; valid_from: string; reason: string }>("SELECT ticker,valid_from::text,reason FROM universe_membership WHERE ticker LIKE 'ZB%' ORDER BY ticker,valid_from").then((r) => r.rows);
  beforeEach(async () => {
    ctx = await migratedPool();
    for (const [ticker, by, from] of [["ZBA", "e8-rollout", "2026-11-07"], ["ZBB", "e8-rollout", "2026-11-07"], ["ZBC", "owner", "2026-11-07"], ["ZBD", "e8-rollout", "2026-11-05"]]) {
      await ctx.pool.query("INSERT INTO instruments(ticker,name,sector,tier,source) VALUES ($1,$1,'Test',NULL,'sample extension')", [ticker]);
      await ctx.pool.query("INSERT INTO universe_membership(ticker,list,tier,valid_from,reason,criteria_version,added_by) VALUES ($1,'extended',NULL,$2,'E8','v1',$3)", [ticker, from, by]);
    }
    await ctx.pool.query("INSERT INTO daily_bars(ticker,bar_date,open,high,low,close,volume) VALUES ('ZBA','2026-11-06',1,1,1,1,1)");
  });
  afterEach(async () => ctx.db.close());

  it("dry run counts the batch and writes nothing", async () => {
    const result = await backdateUniverse(ctx.pool, parseBackdate(base));
    expect(result).toEqual({ rows: 2, byExchange: { US: 2 }, withBarOnTo: 1, applied: false });
    expect((await members(ctx.pool)).map((row) => row.valid_from)).toEqual(["2026-11-07", "2026-11-07", "2026-11-07", "2026-11-05"]);
  });

  it("apply moves only the batch and keeps the original reason with a note", async () => {
    const result = await backdateUniverse(ctx.pool, parseBackdate([...base, "--apply"]));
    expect(result.applied).toBe(true);
    const rows = await members(ctx.pool);
    expect(rows.map((row) => [row.ticker, row.valid_from])).toEqual([["ZBA", "2026-11-06"], ["ZBB", "2026-11-06"], ["ZBC", "2026-11-07"], ["ZBD", "2026-11-05"]]);
    expect(rows[0].reason).toBe("E8 [valid_from 2026-11-07 -> 2026-11-06 by owner: baseline]");
  });

  it("refuses when an earlier membership of the same ticker ends after the new date", async () => {
    await ctx.pool.query("INSERT INTO universe_membership(ticker,list,tier,valid_from,valid_to,reason,criteria_version,added_by) VALUES ('ZBA','discovery',NULL,'2026-11-01','2026-11-07','old','v1','auto')");
    await expect(backdateUniverse(ctx.pool, parseBackdate([...base, "--apply"]))).rejects.toThrow(/overlap.*ZBA/);
    expect((await members(ctx.pool)).filter((row) => row.ticker === "ZBB")[0].valid_from).toBe("2026-11-07");
  });
});
