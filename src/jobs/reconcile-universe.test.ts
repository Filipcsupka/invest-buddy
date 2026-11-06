import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { runReconcile } from "./reconcile";
import { offVerifier } from "../data/evidence";
import { revenueLookup } from "../data/sec";
import { parseEodhdFundamentals } from "../data-providers/eodhd/fundamentals";
import type { Fundamentals } from "../data-providers/eodhd/client";
import { insertFundamentals } from "../collectors/sources/companyfacts";
import { DatabaseUniverseProvider } from "../data/db-provider";
import { PostgresScoreRepository } from "../db/postgres";
import { SCORE_WEIGHTS } from "../engine/score";
import { runDaily } from "./daily";

const AS_OF = "2025-10-21";
const fixture = JSON.parse(readFileSync(join(process.cwd(), "src/data-providers/eodhd/fixtures/offline/AAPL.US.json"), "utf8")) as Fundamentals;

async function migratedPool() {
  const db = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  const query = (sql: string, params?: unknown[]) => db.query(sql, params);
  return { db, pool: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool };
}

/** A scored universe symbol with only stored EODHD facts: no scan_findings, no research_findings. */
async function seedEodhdOnly(pool: pg.Pool) {
  // The migrations seed AAPL in the core list; move its start before the score date.
  await pool.query("UPDATE universe_membership SET valid_from='2025-01-01' WHERE ticker='AAPL' AND list='core'");
  await insertFundamentals(pool, parseEodhdFundamentals(fixture, "AAPL", AS_OF).rows, "eodhd");
  await pool.query("UPDATE fundamentals_pit SET first_seen_at=filed::timestamptz");
  await pool.query(`INSERT INTO collected_facts (symbol,fact_key,as_of,value,computed_at,expires_at,source_id)
    VALUES ('AAPL','eps_surprise_latest','2025-10-15',$1::jsonb,'2025-10-16T06:00:00Z','2026-01-15T00:00:00Z','eodhd')`,
  [JSON.stringify({ reportedDate: "2025-10-15", fiscalDateEnding: "2025-09-30", reportedEps: 1.5, estimatedEps: 1.4, surprisePercent: 7.1, source: "eodhd", displayAllowed: false })]);
}

const consensus = async (pool: pg.Pool) => (await pool.query<{ field: string; value: boolean | null; agreement: string; verified: boolean }>(
  "SELECT field,value,agreement,verified FROM consensus_findings WHERE symbol='AAPL' AND as_of=$1 ORDER BY field", [AS_OF])).rows;

describe("reconcile seeds the universe from stored EODHD facts (PGlite)", () => {
  let ctx: Awaited<ReturnType<typeof migratedPool>>;
  beforeEach(async () => {
    vi.stubEnv("CARRY_FORWARD", "off");
    ctx = await migratedPool();
    await seedEodhdOnly(ctx.pool);
  });
  afterEach(async () => { vi.unstubAllEnvs(); await ctx.db.close(); });

  it("private use on: a universe symbol with no agent findings gets rule rows that reach the score inputs", async () => {
    vi.stubEnv("EODHD_PRIVATE_USE", "on");
    const count = await runReconcile(ctx.pool, AS_OF, offVerifier, revenueLookup(ctx.pool));
    const rows = await consensus(ctx.pool);
    expect(count).toBe(rows.length);
    expect(rows).toContainEqual({ field: "epsBeat", value: true, agreement: "data_rule", verified: true });
    expect(rows).toContainEqual({ field: "revenueAccelerating", value: true, agreement: "xbrl_override", verified: true });
    expect(rows).toContainEqual({ field: "revenueDeclining", value: false, agreement: "xbrl_override", verified: true });
    expect(rows.every((row) => row.value !== null && row.verified)).toBe(true);
    expect(rows.map((row) => row.field)).not.toContain("dataTailwind");

    const provider = new DatabaseUniverseProvider(ctx.pool, AS_OF, false);
    expect((await provider.instruments()).map((item) => item.ticker)).toEqual(["AAPL"]);
    expect(await provider.fundamentals("AAPL")).toMatchObject({ epsBeat: true, revenueAccelerating: true, revenueDeclining: false, revenueGrowthCurrent: 30, revenueGrowthPrior: 10 });

    await ctx.pool.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume)
      SELECT 'AAPL',d::date,100+n*0.1,101+n*0.1,99+n*0.1,100.5+n*0.1,1000000 FROM generate_series('2024-09-02'::date,$1::date,'1 day') WITH ORDINALITY AS g(d,n)
      WHERE extract(isodow FROM d) < 6`, [AS_OF]);
    await runDaily(new DatabaseUniverseProvider(ctx.pool, AS_OF, false), new PostgresScoreRepository(ctx.pool), AS_OF, "scan");
    const score = (await ctx.pool.query<{ fundamentals: number; audit: { ruleHits: { id: string; matched: boolean }[] } }>("SELECT fundamentals,audit FROM score_results WHERE ticker='AAPL' AND as_of=$1", [AS_OF])).rows[0];
    const matched = score.audit.ruleHits.filter((hit) => hit.matched).map((hit) => hit.id);
    expect(matched).toEqual(expect.arrayContaining(["revenue-acceleration", "earnings"]));
    expect(Number(score.fundamentals)).toBeGreaterThanOrEqual(SCORE_WEIGHTS["revenue-acceleration"] + SCORE_WEIGHTS.earnings);
  });

  it("private use on with carry-forward: unsettled fields still carry, settled fields are fresh", async () => {
    vi.stubEnv("EODHD_PRIVATE_USE", "on");
    vi.stubEnv("CARRY_FORWARD", "on");
    for (const [field, value] of [["guidanceRaised", true], ["epsBeat", false]] as const) await ctx.pool.query(`INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
      VALUES ('AAPL',$1,'2025-10-20',$2,'agree','{}'::jsonb,'[]'::jsonb,true,'earlier')`, [field, value]);
    await runReconcile(ctx.pool, AS_OF, offVerifier, revenueLookup(ctx.pool));
    const rows = (await ctx.pool.query<{ field: string; value: boolean | null; carried_from: string | null }>(
      "SELECT field,value,carried_from::text FROM consensus_findings WHERE symbol='AAPL' AND as_of=$1 AND field IN ('guidanceRaised','epsBeat') ORDER BY field", [AS_OF])).rows;
    expect(rows).toEqual([{ field: "epsBeat", value: true, carried_from: null }, { field: "guidanceRaised", value: true, carried_from: "2025-10-20" }]);
  });

  it("private use off: output is unchanged, nothing is written for a universe-only symbol", async () => {
    vi.stubEnv("EODHD_PRIVATE_USE", "off");
    expect(await runReconcile(ctx.pool, AS_OF, offVerifier, revenueLookup(ctx.pool))).toBe(0);
    expect(await consensus(ctx.pool)).toEqual([]);
  });
});
