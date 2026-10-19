import { describe, expect, it } from "vitest";
import { FOMC_URL } from "../collectors/sources/fed";
import { fx } from "../collectors/sources/testing";
import { parseMacroCalendarArgs, runMacroCalendar } from "./macro-calendar";

const http = (fail: (url: string) => boolean = () => false) => ({ async get(url: string) {
  if (fail(url)) throw new Error("HTTP 503");
  return url === FOMC_URL ? fx("fed_calendar.json") : fx("bls_schedule_cpi.html");
} });
const db = () => { const sql: string[] = []; return { sql, async query(text: string) { sql.push(text.split(/\s/)[0]); return { rows: [], rowCount: /^INSERT/.test(text) ? 3 : 0 }; } }; };
const base = { now: new Date("2026-10-19T01:20:00Z"), userAgent: "InvestBuddy ops@example.com" };

describe("macro-calendar job", () => {
  it("parses its options", () => {
    expect(parseMacroCalendarArgs([])).toEqual({ dryRun: false });
    expect(parseMacroCalendarArgs(["--dry-run"])).toEqual({ dryRun: true });
    expect(() => parseMacroCalendarArgs(["--force"])).toThrow("Unknown macro-calendar option");
  });
  it("stores every kind that was read", async () => {
    const store = db();
    const result = await runMacroCalendar({ ...base, http: http(), db: store as never, dryRun: false });
    expect(result.kinds).toEqual({ CPI: 14, PPI: 14, NFP: 14, FOMC: 2 });
    expect(result).toMatchObject({ requests: 4, written: 12, failures: [] });
    expect(store.sql.filter((s) => s === "COMMIT")).toHaveLength(4);
  });
  it("writes nothing on a dry run and leaves a failed kind untouched", async () => {
    const dry = db();
    expect((await runMacroCalendar({ ...base, http: http(), db: dry as never, dryRun: true })).written).toBe(0);
    expect(dry.sql).toEqual([]);
    const store = db();
    const result = await runMacroCalendar({ ...base, http: http((url) => url === FOMC_URL), db: store as never, dryRun: false });
    expect(Object.keys(result.kinds)).toEqual(["CPI", "PPI", "NFP"]);
    expect(result.failures).toEqual(["FOMC: HTTP 503"]);
    expect(store.sql.filter((s) => s === "COMMIT")).toHaveLength(3);
  });
});
