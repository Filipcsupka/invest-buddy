import pg from "pg";
import { describe, expect, it } from "vitest";
import type { ScheduledRelease } from "../collectors/sources/macro-schedule";
import { loadMacroEvents } from "../data/macro-calendar";
import { replaceMacroSchedule } from "./macro-events";

const release = (date: string, kind: ScheduledRelease["kind"] = "CPI"): ScheduledRelease => ({ kind, date, label: `${kind} test`, referencePeriod: null, releaseTime: "08:30 AM", sourceId: kind === "FOMC" ? "fed" : "bls", sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm" });

function recorder(fail?: RegExp) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  return { calls, async query(sql: string, params?: unknown[]) {
    calls.push({ sql, params });
    if (fail?.test(sql)) throw new Error("boom");
    return { rows: [], rowCount: /^DELETE/.test(sql) ? 1 : /^INSERT/.test(sql) ? 2 : null };
  } };
}

describe("replaceMacroSchedule", () => {
  it("removes moved future dates of the kind and upserts the rest in one transaction", async () => {
    const db = recorder();
    const result = await replaceMacroSchedule(db as never, "CPI", [release("2026-10-01"), release("2026-11-12"), release("2027-01-13"), release("2026-12-09", "FOMC")], "2026-10-19");
    expect(result).toEqual({ written: 2, removed: 1 });
    expect(db.calls.map((c) => c.sql.split(/\s/)[0])).toEqual(["BEGIN", "DELETE", "INSERT", "COMMIT"]);
    expect(db.calls[1].params).toEqual(["CPI", "2026-10-19", ["2026-11-12", "2027-01-13"]]);
    expect(db.calls[2].params?.[1]).toEqual(["2026-11-12", "2027-01-13"]);
  });
  it("refuses an empty schedule and rolls back a failed write", async () => {
    await expect(replaceMacroSchedule(recorder() as never, "CPI", [release("2026-10-01")], "2026-10-19")).rejects.toThrow("no CPI rows");
    const db = recorder(/^INSERT/);
    await expect(replaceMacroSchedule(db as never, "CPI", [release("2026-11-12")], "2026-10-19")).rejects.toThrow("boom");
    expect(db.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
});

const dbDescribe = describe.skipIf(!process.env.TEST_DATABASE_URL);
dbDescribe("macro_events (Postgres)", () => {
  it("replaces a moved date and reads it back merged with the fallback", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SAVEPOINT outer_test");
      const tx = { query: (sql: string, params?: unknown[]) => client.query(sql === "BEGIN" ? "SAVEPOINT replace_test" : sql === "COMMIT" ? "RELEASE SAVEPOINT replace_test" : sql === "ROLLBACK" ? "ROLLBACK TO SAVEPOINT replace_test" : sql, params) };
      await replaceMacroSchedule(tx as never, "CPI", [release("2099-11-10"), release("2099-12-10")], "2099-10-19");
      expect(await replaceMacroSchedule(tx as never, "CPI", [release("2099-11-13"), release("2099-12-10")], "2099-10-19")).toEqual({ written: 1, removed: 1 });
      const events = await loadMacroEvents(client as never, "2099-10-19");
      expect(events.filter((e) => e.kind === "CPI").map((e) => e.date)).toEqual(["2099-11-13", "2099-12-10"]);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
