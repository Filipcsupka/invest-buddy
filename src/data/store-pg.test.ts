import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AUDIT_BAR_LIMIT, LISTING_BAR_LIMIT } from "./audit-sql";
import { windowSessions } from "../heatmap/aggregate";
import { SCANNER_FLOOR } from "../app/[locale]/(app)/scanner/floor";

/** Every migration applied, so migration 137 and the store queries run as written. */
const db = new PGlite();
const sql: string[] = [];
vi.mock("../db/pool", () => ({ getPool: () => ({ query: (text: string, params?: unknown[]) => { sql.push(text); return db.query(text, params); } }) }));
import { alertHistory, latestScores, latestScoreSummaries, scoreForTicker, scoreHistory } from "./store";

const bars = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `d${String(i).padStart(3, "0")}`, open: i, high: i, low: i, close: i, volume: 1000 + i }));
const audit = (extra: Record<string, unknown>, n = 400) => JSON.stringify({ ticker: "x", state: "Watch", total: 7, ruleHits: [{ id: "r1" }], inputs: { bars: bars(n), fundamentals: { epsBeat: true } }, ...extra });
const env = { ...process.env };

beforeAll(async () => {
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));
  await db.exec(`INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('PZ1','p','t',1,'guide'),('PZ2','p','t',1,'guide'),('PZ3','p','t',1,'guide');
    INSERT INTO universe_membership (ticker,list,tier,valid_from,reason,criteria_version,added_by)
      VALUES ('PZ1','core',1,'2026-01-01','r','v','x'),('PZ2','core',1,'2026-01-01','r','v','x'),('PZ3','core',1,'2026-01-01','r','v','x')`);
  const insert = (ticker: string, asOf: string, body: string) => db.query(`INSERT INTO score_results (ticker,as_of,technical,fundamentals,macro,total,state,audit) VALUES ($1,$2,1,1,1,7,'Watch',$3)`, [ticker, asOf, body]);
  // PZ1: scan rows; the newest is the page row. PZ2: newest row is stored-fact only (agreement), older one is a scan row.
  // PZ3: short bar history, scan row only.
  await insert("PZ1", "2026-11-02", audit({ scanRunId: "a" }));
  await insert("PZ1", "2026-11-03", audit({ scanRunId: "b" }));
  await insert("PZ2", "2026-11-02", audit({ scanRunId: "c" }));
  await insert("PZ2", "2026-11-03", audit({ agreement: { ok: true } }));
  await insert("PZ2", "2026-11-04", audit({}));
  await insert("PZ3", "2026-11-03", audit({ scanRunId: "d" }, 10));
});
afterAll(async () => { process.env = env; await db.close(); });

const mode = (privateUse: boolean) => {
  delete process.env.DATA_MODE; delete process.env.SCORE_EXTENDED;
  if (privateUse) process.env.EODHD_PRIVATE_USE = "on"; else delete process.env.EODHD_PRIVATE_USE;
};
const pick = (rows: { instrument: { ticker: string }; result: { inputs: { bars: unknown[] } } }[]) => rows.filter((row) => row.instrument.ticker.startsWith("PZ"));

describe("page-row columns (migration 137)", () => {
  it("match the old jsonb key tests on every row", async () => {
    const rows = (await db.query<{ a: boolean; b: boolean; c: boolean; d: boolean }>(`SELECT has_scan_run = (audit ? 'scanRunId') AS a, has_agreement = (audit ? 'agreement') AS b,
      (has_scan_run OR has_agreement) = (audit ? 'scanRunId' OR audit ? 'agreement') AS c, listing_audit - 'inputs' = audit - 'inputs' AS d FROM score_results`)).rows;
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.every((row) => row.a && row.b && row.c && row.d)).toBe(true);
  });

  it("keep the last LISTING_BAR_LIMIT bars in order and other inputs unchanged", async () => {
    const row = (await db.query<{ l: { inputs: { bars: { date: string }[]; fundamentals: unknown } } }>("SELECT listing_audit AS l FROM score_results WHERE ticker='PZ1' AND as_of='2026-11-03'")).rows[0];
    expect(row.l.inputs.bars).toHaveLength(LISTING_BAR_LIMIT);
    expect(row.l.inputs.bars[0].date).toBe(`d${400 - LISTING_BAR_LIMIT}`);
    expect(row.l.inputs.bars.at(-1)?.date).toBe("d399");
    expect(row.l.inputs.fundamentals).toEqual({ epsBeat: true });
    const short = (await db.query<{ l: unknown; a: unknown }>("SELECT listing_audit AS l, audit AS a FROM score_results WHERE ticker='PZ3'")).rows[0];
    expect(short.l).toEqual(short.a);
  });

  it("cover the heatmap 3m window and the scanner floor", () => {
    expect(LISTING_BAR_LIMIT).toBeGreaterThan(windowSessions["3m"]);
    expect(LISTING_BAR_LIMIT).toBeGreaterThanOrEqual(SCANNER_FLOOR.days);
    expect(readFileSync(join(process.cwd(), "migrations/137_score_results_page_columns.sql"), "utf8")).toContain(`> ${LISTING_BAR_LIMIT}`);
  });

  it("filter without reading the audit", async () => {
    for (const privateUse of [false, true]) {
      mode(privateUse);
      sql.length = 0;
      await latestScores();
      const plan = (await db.query<{ "QUERY PLAN": string }>(`EXPLAIN (VERBOSE) ${sql[0]}`)).rows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(plan).not.toMatch(/audit \?|jsonb_exists/);
    }
  });
});

describe("score store reads", () => {
  it("pick the same page rows as the old predicate in both modes", async () => {
    mode(false);
    expect(pick((await latestScores()).rows).map((row) => [row.instrument.ticker, (row.result as unknown as { scanRunId?: string }).scanRunId])).toEqual([["PZ1", "b"], ["PZ2", "c"], ["PZ3", "d"]]);
    mode(true);
    expect(pick((await latestScores()).rows).map((row) => [row.instrument.ticker, "agreement" in row.result])).toEqual([["PZ1", false], ["PZ2", true], ["PZ3", false]]);
  });

  it("listing paths never load more than LISTING_BAR_LIMIT bars; only the company read loads the chart window", async () => {
    mode(false);
    expect(pick((await latestScores()).rows).map((row) => row.result.inputs.bars.length)).toEqual([LISTING_BAR_LIMIT, LISTING_BAR_LIMIT, 10]);
    expect(pick((await latestScoreSummaries()).rows).every((row) => row.result.inputs.bars.length === 0)).toBe(true);
    expect(pick((await scoreHistory()).rows).every((row) => row.result.inputs.bars.length === 0)).toBe(true);
    expect((await scoreForTicker("PZ1")).rows?.result.inputs.bars).toHaveLength(AUDIT_BAR_LIMIT);
  });

  it("listing SQL reads listing_audit, never the full audit column", async () => {
    mode(false);
    sql.length = 0;
    await latestScores(); await latestScoreSummaries(); await scoreHistory(); await alertHistory();
    expect(sql.length).toBeGreaterThanOrEqual(3);
    for (const text of sql) expect(text).not.toMatch(/\.audit\b/);
  });
});
