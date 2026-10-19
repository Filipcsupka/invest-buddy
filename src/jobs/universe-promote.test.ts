import pg from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { changeUniverse, parseChange } from "../../scripts/universe-change";
import { sessionsBetween } from "../data/trading-calendar";
import { PROMOTE } from "../universe/promote";
import { loadPlan, parsePromoteArgs, promoteToCore, recentSessions } from "./universe-promote";

describe("universe-promote arguments", () => {
  it("defaults to the weekly cap and writes unless --dry-run", () => {
    expect(parsePromoteArgs([])).toEqual({ dryRun: false, cap: PROMOTE.weeklyCap });
    expect(parsePromoteArgs(["--dry-run", "--cap", "3"])).toEqual({ dryRun: true, cap: 3 });
    expect(() => parsePromoteArgs(["--cap", "-1"])).toThrow();
    expect(() => parsePromoteArgs(["--limit", "3"])).toThrow();
  });
  it("lists the last sessions, newest last, skipping weekends and holidays", () => {
    expect(recentSessions("2026-10-16", 10)).toEqual(sessionsBetween("2026-10-05", "2026-10-16"));
    expect(recentSessions("2026-10-16", 10)).toHaveLength(10);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("promotion in PostgreSQL", () => {
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const ticker = "D36ZZ";
  afterAll(async () => db.end());
  afterEach(async () => {
    await db.query("DELETE FROM universe_membership WHERE ticker=$1", [ticker]);
    await db.query("DELETE FROM daily_bars WHERE ticker=$1", [ticker]);
    await db.query("DELETE FROM instruments WHERE ticker=$1", [ticker]);
  });
  it("ends the extended row, opens a core row and does nothing on a second run", async () => {
    await changeUniverse(db, parseChange(["add", ticker, "--date", "2026-09-01", "--name", "Promote test", "--sector", "Test", "--list", "extended", "--criteria-version", "v1", "--reason", "D36", "--actor", "owner"]));
    const days = sessionsBetween("2025-09-01", "2026-10-16");
    await db.query(`INSERT INTO daily_bars(ticker,bar_date,open,high,low,close,volume) SELECT $1, d::date, 100, 101, 99, 100, 1000 FROM unnest($2::text[]) d`, [ticker, days]);
    const plan = await loadPlan(db, "2026-10-18", "2026-10-16", 10);
    expect(plan.promote.map((p) => p.ticker)).toContain(ticker);
    expect(await promoteToCore(db, { ticker, date: "2026-10-18", reason: "test" })).toBe(true);
    expect(await promoteToCore(db, { ticker, date: "2026-10-18", reason: "test" })).toBe(false);
    const rows = await db.query<{ list: string; valid_to: string | null; added_by: string; removed_by: string | null }>(
      "SELECT list, valid_to::text, added_by, removed_by FROM universe_membership WHERE ticker=$1 ORDER BY valid_from", [ticker]);
    expect(rows.rows).toEqual([
      { list: "extended", valid_to: "2026-10-18", added_by: "owner", removed_by: PROMOTE.actor },
      { list: "core", valid_to: null, added_by: PROMOTE.actor, removed_by: null },
    ]);
    const again = await loadPlan(db, "2026-10-18", "2026-10-16", 10);
    expect(again.promote.map((p) => p.ticker)).not.toContain(ticker);
    expect(again.alreadyThisWeek).toBeGreaterThanOrEqual(1);
  });
});
