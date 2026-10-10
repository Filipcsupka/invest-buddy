import pg from "pg";
import { describe, expect, it } from "vitest";
import type { OHLCV } from "../engine";
import { sessionsBetween } from "../data/trading-calendar";
import { checkCalendar, checkTicker, hasFail, runChecks, saveRows, loadInputs, type DqRow } from "./dq";

const ctx = { asOf: "2026-10-09", today: "2026-10-10" };
const sessions = sessionsBetween("2025-09-01", ctx.asOf);
const bar = (date: string, over: Partial<OHLCV> = {}): OHLCV => ({ date, open: 100, high: 101, low: 99, close: 100, volume: 1000, ...over });
const clean = () => sessions.map((d) => bar(d));
const byCheck = (rows: DqRow[]) => Object.fromEntries(rows.map((r) => [r.checkId, r]));

describe("dq checks", () => {
  it("clean fixture gives only pass", () => {
    expect(sessions.length).toBeGreaterThanOrEqual(200);
    const rows = checkTicker({ ticker: "NVDA", bars: clean() }, ctx);
    expect(rows.map((r) => r.checkId).sort()).toEqual(["daily_move", "duplicate_dates", "high_below_low", "missing_sessions", "row_count", "stale_bar", "zero_volume"]);
    expect(rows.every((r) => r.status === "pass")).toBe(true);
  });

  it("two missing sessions warn with the exact dates, five fail", () => {
    const dropped = [sessions[100], sessions[150]];
    const rows = byCheck(checkTicker({ ticker: "NVDA", bars: clean().filter((b) => !dropped.includes(b.date)) }, ctx));
    expect(rows.missing_sessions).toMatchObject({ status: "warn", detail: { count: 2, dates: dropped } });
    const five = sessions.slice(100, 105);
    expect(byCheck(checkTicker({ ticker: "NVDA", bars: clean().filter((b) => !five.includes(b.date)) }, ctx)).missing_sessions).toMatchObject({ status: "fail", detail: { count: 5 } });
  });

  it("holidays are not missing sessions", () => {
    expect(sessions).not.toContain("2026-09-07");
    expect(byCheck(checkTicker({ ticker: "NVDA", bars: clean() }, ctx)).missing_sessions.status).toBe("pass");
  });

  it("bar older than 3 days fails, exactly 3 passes", () => {
    const old = clean().filter((b) => b.date <= "2026-10-06");
    expect(byCheck(checkTicker({ ticker: "NVDA", bars: old }, ctx)).stale_bar).toMatchObject({ status: "fail", detail: { latest: "2026-10-06", ageDays: 4 } });
    const edge = clean().filter((b) => b.date <= "2026-10-07");
    expect(byCheck(checkTicker({ ticker: "NVDA", bars: edge }, ctx)).stale_bar).toMatchObject({ status: "pass", detail: { ageDays: 3 } });
  });

  it("move over 40% warns, 40% exactly passes", () => {
    const bars = clean();
    bars[50] = bar(bars[50].date, { open: 140, high: 141, low: 139, close: 141 });
    bars[51] = bar(bars[51].date, { close: 100 });
    const rows = byCheck(checkTicker({ ticker: "NVDA", bars }, ctx));
    expect(rows.daily_move.status).toBe("warn");
    expect((rows.daily_move.detail.moves as { date: string }[]).map((m) => m.date)).toEqual([bars[50].date]);
    const at = clean();
    at[50] = bar(at[50].date, { open: 140, high: 141, low: 139, close: 140 });
    at[51] = bar(at[51].date, { close: 140, open: 140, high: 141, low: 139 });
    expect(byCheck(checkTicker({ ticker: "NVDA", bars: at }, ctx)).daily_move.detail.moves).toBeUndefined();
    expect(byCheck(checkTicker({ ticker: "NVDA", bars: at }, ctx)).daily_move.status).toBe("pass");
  });

  it("zero volume on a session warns", () => {
    const bars = clean();
    bars[70] = bar(bars[70].date, { volume: 0 });
    expect(byCheck(checkTicker({ ticker: "NVDA", bars }, ctx)).zero_volume).toMatchObject({ status: "warn", detail: { dates: [bars[70].date] } });
  });

  it("high below low fails", () => {
    const bars = clean();
    bars[80] = bar(bars[80].date, { high: 98, low: 99 });
    expect(byCheck(checkTicker({ ticker: "NVDA", bars }, ctx)).high_below_low).toMatchObject({ status: "fail", detail: { dates: [bars[80].date] } });
  });

  it("duplicate dates fail", () => {
    const bars = [...clean(), bar(sessions[10])];
    expect(byCheck(checkTicker({ ticker: "NVDA", bars }, ctx)).duplicate_dates).toMatchObject({ status: "fail", detail: { dates: [sessions[10]] } });
  });

  it("fewer than 200 rows fail, 200 pass", () => {
    expect(byCheck(checkTicker({ ticker: "NEW", bars: clean().slice(-199) }, ctx)).row_count).toMatchObject({ status: "fail", detail: { rows: 199, minimum: 200 } });
    expect(byCheck(checkTicker({ ticker: "NEW", bars: clean().slice(-200) }, ctx)).row_count.status).toBe("pass");
  });

  it("a ticker without bars fails", () => {
    const rows = byCheck(checkTicker({ ticker: "NONE", bars: [] }, ctx));
    expect(["row_count", "missing_sessions", "stale_bar"].map((c) => rows[c].status)).toEqual(["fail", "fail", "fail"]);
  });

  it("calendar ending within 60 days fails, 60 days passes", () => {
    expect(checkCalendar(ctx, "2026-12-08")).toMatchObject({ status: "fail", detail: { daysLeft: 59 } });
    expect(checkCalendar(ctx, "2026-12-09").status).toBe("pass");
    expect(checkCalendar(ctx).status).toBe("pass");
  });

  it("hasFail drives the exit code decision", () => {
    expect(hasFail(runChecks([{ ticker: "NVDA", bars: clean() }], ctx))).toBe(false);
    expect(hasFail(runChecks([{ ticker: "NVDA", bars: clean() }], ctx, "2026-11-01"))).toBe(true);
  });
});

describe("dq storage", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("saves rows and replaces them on a same-day rerun", async () => {
    const pool = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.connect();
    try {
      await pool.query("BEGIN");
      await saveRows(pool, [{ checkId: "t_check", subject: "ZZZ", asOf: "2026-10-09", status: "warn", detail: { a: 1 } }]);
      await saveRows(pool, [{ checkId: "t_check", subject: "ZZZ", asOf: "2026-10-09", status: "pass", detail: {} }]);
      const res = await pool.query("SELECT status, detail FROM dq_results WHERE check_id='t_check'");
      expect(res.rows).toEqual([{ status: "pass", detail: {} }]);
      await expect(pool.query("INSERT INTO dq_results (check_id,subject,as_of,status) VALUES ('t','z','2026-10-09','bad')")).rejects.toThrow();
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("loadInputs returns instruments without bars as empty", async () => {
    const pool = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.connect();
    try {
      await pool.query("BEGIN");
      await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('ZZQ','t','t',1,'guide')");
      await pool.query("INSERT INTO universe_membership(ticker,list,tier,valid_from,reason,criteria_version,added_by) VALUES ('ZZQ','core',1,'2026-10-09','Test','v1','test')");
      const inputs = await loadInputs(pool, "2026-10-10");
      expect(inputs.find((i) => i.ticker === "ZZQ")).toEqual({ ticker: "ZZQ", bars: [] });
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });
});
