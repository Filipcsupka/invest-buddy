import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { ruleStreak, ruleStreaksFromDb, streaksFromRows, type RuleDay } from "./rules-streak";
import type { Queryable } from "./history";
import { HITS } from "./rule-changes";

const hit = (id: string, matched: boolean, unknown = false) => ({ id, matched, unknown });
const day = (asOf: string, ...hits: ReturnType<typeof hit>[]): RuleDay => ({ asOf, hits });

describe("ruleStreak", () => {
  it("returns null without history and no change with one day", () => {
    expect(ruleStreak([])).toBeNull();
    expect(ruleStreak([day("2026-10-14", hit("uptrend", true))])).toEqual({ met: ["uptrend"], sinceDays: 0, atLeast: false, gained: [], lost: [] });
  });

  it("counts calendar days since the met set last changed", () => {
    const streak = ruleStreak([
      day("2026-10-14", hit("uptrend", true), hit("catalyst", false)),
      day("2026-10-13", hit("uptrend", true), hit("catalyst", false)),
      day("2026-10-10", hit("uptrend", true), hit("catalyst", false)),
      day("2026-10-09", hit("uptrend", true), hit("catalyst", true)),
    ]);
    expect(streak).toMatchObject({ met: ["uptrend"], sinceDays: 4, atLeast: false });
  });

  it("marks a streak as a lower bound when history ends first", () => {
    const streak = ruleStreak([day("2026-10-14", hit("a", true)), day("2026-10-12", hit("a", true))]);
    expect(streak).toMatchObject({ sinceDays: 2, atLeast: true });
  });

  it("reports rules gained and lost against the day a week earlier", () => {
    const streak = ruleStreak([
      day("2026-10-14", hit("a", true), hit("b", false), hit("c", true)),
      day("2026-10-13", hit("a", true), hit("b", true), hit("c", false)),
      day("2026-10-07", hit("a", true), hit("b", true), hit("c", false)),
      day("2026-10-06", hit("a", false), hit("b", false), hit("c", false)),
    ]);
    expect(streak).toMatchObject({ gained: ["c"], lost: ["b"] });
  });

  it("does not count a rule that became unknown as lost", () => {
    const streak = ruleStreak([day("2026-10-14", hit("a", false, true)), day("2026-10-07", hit("a", true))]);
    expect(streak).toMatchObject({ met: [], lost: [], gained: [] });
  });

  it("shows no change for a young ticker without a baseline a week back", () => {
    const streak = ruleStreak([day("2026-10-14", hit("a", true)), day("2026-10-13", hit("a", false))]);
    expect(streak).toMatchObject({ gained: [], lost: [], sinceDays: 0 });
  });

  it("shows no change when the ticker was last scored more than a week before the newest snapshot", () => {
    const days = [day("2026-09-20", hit("a", true)), day("2026-09-12", hit("a", false))];
    expect(ruleStreak(days, "2026-10-14")).toMatchObject({ gained: [], lost: [] });
    expect(ruleStreak(days, "2026-09-22")).toMatchObject({ gained: ["a"] });
  });

  it("ignores a baseline far outside the stated week", () => {
    const streak = ruleStreak([day("2026-10-14", hit("a", true)), day("2026-08-01", hit("a", false))]);
    expect(streak).toMatchObject({ gained: [], lost: [] });
  });
});

describe("streaksFromRows", () => {
  it("groups by ticker and sorts days newest first", () => {
    const out = streaksFromRows([
      { ticker: "AMD", asOf: "2026-10-07", hits: [hit("a", true)] },
      { ticker: "AMD", asOf: "2026-10-14", hits: [hit("a", false)] },
      { ticker: "NVDA", asOf: "2026-10-14", hits: [hit("a", true)] },
    ]);
    expect(out.AMD).toMatchObject({ met: [], lost: ["a"], sinceDays: 0 });
    expect(out.NVDA.met).toEqual(["a"]);
  });
});

describe("streaksFromRows recency", () => {
  it("drops gained and lost for a ticker that stopped being scored", () => {
    const out = streaksFromRows([
      { ticker: "OLD", asOf: "2026-09-20", hits: [hit("a", true)] },
      { ticker: "OLD", asOf: "2026-09-12", hits: [hit("a", false)] },
      { ticker: "NEW", asOf: "2026-10-14", hits: [hit("a", true)] },
      { ticker: "NEW", asOf: "2026-10-07", hits: [hit("a", false)] },
    ]);
    expect(out.OLD).toMatchObject({ gained: [], lost: [] });
    expect(out.NEW).toMatchObject({ gained: ["a"] });
  });
});

describe("ruleStreaksFromDb", () => {
  it("runs one windowed query and reads only rule hits", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const db: Queryable = { query: async (text, params = []) => { calls.push({ text, params }); return { rows: [{ ticker: "AMD", asOf: "2026-10-14", hits: [hit("a", true)] }, { ticker: "BAD", asOf: "nope", hits: [] }] as never[] }; } };
    const out = await ruleStreaksFromDb(db);
    expect(Object.keys(out)).toEqual(["AMD"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual([90]);
    expect(calls[0].text).toContain("s.streak_hits AS hits");
    expect(calls[0].text).toMatch(/s\.ticker IN \(SELECT c\.ticker FROM score_results c WHERE c\.as_of = /);
    expect(calls[0].text).not.toContain("s.audit");
  });

  it("matches the audit-based streaks in public and private modes", async () => {
    const db = new PGlite();
    const privateUse = process.env.EODHD_PRIVATE_USE;
    try {
      await db.exec(`CREATE TABLE score_results (
        ticker text NOT NULL, as_of date NOT NULL, audit jsonb NOT NULL,
        has_scan_run boolean GENERATED ALWAYS AS (audit ? 'scanRunId') STORED,
        has_agreement boolean GENERATED ALWAYS AS (audit ? 'agreement') STORED,
        PRIMARY KEY (ticker, as_of));`);
      await db.exec(readFileSync("migrations/146_score_results_streak_hits.sql", "utf8"));
      const bars = Array.from({ length: 300 }, (_, n) => ({ date: n, close: n + 1, volume: 1000 + n }));
      const insert = (ticker: string, asOf: string, hits: unknown, marker: "scanRunId" | "agreement" | "none" = "scanRunId") =>
        db.query("INSERT INTO score_results (ticker, as_of, audit) VALUES ($1, $2, $3)", [ticker, asOf, JSON.stringify({ ruleHits: hits, inputs: { bars }, ...(marker === "none" ? {} : { [marker]: "run" }) })]);
      await insert("AMD", "2026-10-14", [hit("a", true), hit("b", false), hit("c", false, true)]);
      await insert("AMD", "2026-10-07", [hit("a", false), hit("b", true), hit("c", true)]);
      await insert("AMD", "2026-10-06", [hit("a", false), hit("b", true), hit("c", true)]);
      await insert("NVDA", "2026-10-14", [hit("a", true)], "agreement");
      await insert("NVDA", "2026-10-07", [hit("a", false)], "agreement");
      await insert("OLD", "2026-10-07", [hit("a", true)]);
      await insert("AMD", "2026-10-13", [], "none");
      const queryable = { query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as Queryable;
      for (const privateMode of [false, true]) {
        if (privateMode) process.env.EODHD_PRIVATE_USE = "on";
        else delete process.env.EODHD_PRIVATE_USE;
        const predicate = privateMode ? "(s.has_scan_run OR s.has_agreement)" : "s.has_scan_run";
        const old = await db.query<{ ticker: string; asOf: string; hits: RuleDay["hits"] }>(`WITH latest AS (SELECT max(as_of) AS d FROM score_results WHERE ${privateMode ? "(has_scan_run OR has_agreement)" : "has_scan_run"})
          SELECT s.ticker, s.as_of::text AS "asOf", ${HITS} AS hits FROM score_results s
          WHERE ${predicate} AND s.as_of >= (SELECT d FROM latest) - 90
            AND s.ticker IN (SELECT c.ticker FROM score_results c WHERE c.as_of = (SELECT d FROM latest) AND ${privateMode ? "(c.has_scan_run OR c.has_agreement)" : "c.has_scan_run"})
          ORDER BY s.ticker, s.as_of DESC`);
        expect(await ruleStreaksFromDb(queryable)).toEqual(streaksFromRows(old.rows));
      }
      const size = await db.query<{ full: number; slim: number }>("SELECT sum(pg_column_size(audit))::int AS full, sum(pg_column_size(streak_hits))::int AS slim FROM score_results");
      expect(size.rows[0].slim).toBeLessThan(size.rows[0].full / 10);
    } finally {
      if (privateUse === undefined) delete process.env.EODHD_PRIVATE_USE;
      else process.env.EODHD_PRIVATE_USE = privateUse;
      await db.close();
    }
  });
});
