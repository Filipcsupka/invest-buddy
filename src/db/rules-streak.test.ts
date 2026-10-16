import { describe, expect, it } from "vitest";
import { ruleStreak, ruleStreaksFromDb, streaksFromRows, type RuleDay } from "./rules-streak";
import type { Queryable } from "./history";

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
    expect(calls[0].text).toContain("jsonb_to_recordset");
    expect(calls[0].text).toMatch(/s\.ticker IN \(SELECT c\.ticker FROM score_results c WHERE c\.as_of = /);
    expect(calls[0].text).not.toMatch(/s\.audit\s*,|s\.audit AS/);
  });
});
