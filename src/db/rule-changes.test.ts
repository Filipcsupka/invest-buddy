import { describe, expect, it } from "vitest";
import { diffRuleStates, ruleChangesForDate, ruleHistory, ruleState } from "./rule-changes";
import type { Queryable } from "./history";

const hit = (id: string, matched: boolean, unknown = false) => ({ id, matched, unknown });

describe("diffRuleStates", () => {
  it("reports pass to fail", () => {
    expect(diffRuleStates([hit("uptrend", true)], [hit("uptrend", false)])).toEqual([{ ruleId: "uptrend", from: "pass", to: "fail" }]);
  });

  it("keeps fail to unknown apart from fail", () => {
    expect(ruleState(hit("catalyst", false, true))).toBe("unknown");
    expect(diffRuleStates([hit("catalyst", false)], [hit("catalyst", false, true)])).toEqual([{ ruleId: "catalyst", from: "fail", to: "unknown" }]);
  });

  it("returns nothing on the first day, without a previous row", () => {
    expect(diffRuleStates(null, [hit("uptrend", true)])).toEqual([]);
    expect(diffRuleStates([], [hit("uptrend", true)])).toEqual([]);
  });

  it("ignores unchanged rules and rules present on one side only", () => {
    expect(diffRuleStates([hit("a", true), hit("b", false)], [hit("a", true), hit("b", false), hit("c", true)])).toEqual([]);
  });
});

function fake(sequence: Record<string, unknown>[][]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const db: Queryable = { query: async (text, params = []) => { calls.push({ text, params }); return { rows: (sequence.shift() ?? []) as never[] }; } };
  return { db, calls };
}

describe("ruleChangesForDate", () => {
  it("diffs each ticker against its previous day and labels in the locale", async () => {
    const { db } = fake([
      [{ ticker: "AMD", hits: [hit("uptrend", false)] }, { ticker: "NVDA", hits: [hit("uptrend", false), hit("catalyst", true)] }, { ticker: "NEW", hits: [hit("uptrend", true)] }],
      [{ ticker: "AMD", hits: [hit("uptrend", true)] }, { ticker: "NVDA", hits: [hit("uptrend", false), hit("catalyst", false, true)] }],
    ]);
    const changes = await ruleChangesForDate(db, "2026-10-14", "en");
    expect(changes).toEqual([
      { ticker: "AMD", ruleId: "uptrend", label: "Uptrend intact", from: "pass", to: "fail" },
      { ticker: "NVDA", ruleId: "catalyst", label: "Curated product catalyst", from: "unknown", to: "pass" },
    ]);
  });

  it("selects only rule id, matched and unknown from the audit", async () => {
    const { db, calls } = fake([[{ ticker: "AMD", hits: [] }], []]);
    await ruleChangesForDate(db, "2026-10-14");
    for (const call of calls) {
      expect(call.text).toMatch(/jsonb_to_recordset/);
      expect(call.text).not.toMatch(/audit->'inputs'|s\.audit AS|inputs|vendor/);
    }
    await expect(ruleChangesForDate(db, "bad")).rejects.toThrow(RangeError);
  });

  it("returns an empty list when nothing was scored", async () => {
    expect(await ruleChangesForDate(fake([[]]).db, "2026-10-14")).toEqual([]);
  });
});

describe("ruleHistory", () => {
  const days = [
    { asOf: "2026-10-14", hits: [hit("uptrend", false)] },
    { asOf: "2026-10-13", hits: [hit("uptrend", true)] },
    { asOf: "2026-10-12", hits: [hit("uptrend", true)] },
  ];

  it("pages newest first and uses the extra row only as the previous day", async () => {
    const { db, calls } = fake([days]);
    const page = await ruleHistory(db, "AMD", { limit: 2, locale: "sk" });
    expect(calls[0].params).toEqual(["AMD", null, 3]);
    expect(page.rows).toEqual([{ asOf: "2026-10-14", ruleId: "uptrend", label: "Rastový trend trvá", from: "pass", to: "fail" }]);
    expect(page.nextCursor).toBe("2026-10-13");
  });

  it("has no cursor on the last page and rejects a bad cursor or limit", async () => {
    const page = await ruleHistory(fake([days.slice(1)]).db, "AMD", { limit: 5, cursor: "2026-10-14" });
    expect(page).toEqual({ rows: [], nextCursor: null });
    await expect(ruleHistory(fake([]).db, "AMD", { cursor: "x" })).rejects.toThrow(RangeError);
    await expect(ruleHistory(fake([]).db, "AMD", { limit: 0 })).rejects.toThrow(RangeError);
  });
});
