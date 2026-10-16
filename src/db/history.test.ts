import { describe, expect, it } from "vitest";
import { depthFloor, fundamentalsHistory, scoreHistory, universeAsOf, type Queryable } from "./history";

function fake(rows: Record<string, unknown>[] = []) {
  const calls: { text: string; params: unknown[] }[] = [];
  const db: Queryable = { query: async (text, params = []) => { calls.push({ text, params }); return { rows: rows as never[] }; } };
  return { db, calls };
}

describe("history read model (unit)", () => {
  it("turns a tier limit into a date floor and treats null as no limit", () => {
    expect(depthFloor(30, "2026-10-10")).toBe("2026-09-10");
    expect(depthFloor(0, "2026-10-10")).toBe("2026-10-10");
    expect(depthFloor(null)).toBeNull();
    expect(() => depthFloor(-1)).toThrow(/tierLimitDays/);
    expect(() => depthFloor(1.5)).toThrow(/tierLimitDays/);
  });

  it("passes the later of from and the tier floor to the query", async () => {
    const a = fake();
    await scoreHistory(a.db, "NVDA", { from: "2026-01-01", tierLimitDays: 30, today: "2026-10-10" });
    expect(a.calls[0].params[1]).toBe("2026-09-10");
    const b = fake();
    await scoreHistory(b.db, "NVDA", { from: "2026-10-05", tierLimitDays: 30, today: "2026-10-10" });
    expect(b.calls[0].params[1]).toBe("2026-10-05");
  });

  it("cuts score history at the free depth of 90 days and leaves paid depth unlimited", async () => {
    const free = fake();
    await scoreHistory(free.db, "NVDA", { tierLimitDays: 90, today: "2026-10-16" });
    expect(free.calls[0].params[1]).toBe("2026-07-18");
    const paid = fake();
    await scoreHistory(paid.db, "NVDA", { tierLimitDays: null, today: "2026-10-16" });
    expect(paid.calls[0].params[1]).toBeNull();
  });

  it("never selects audit, first_seen_at or membership reasons", async () => {
    const a = fake();
    await scoreHistory(a.db, "NVDA");
    await fundamentalsHistory(a.db, "NVDA", "Revenues");
    await universeAsOf(a.db, "2026-10-10");
    for (const call of a.calls) expect(call.text).not.toMatch(/audit|first_seen_at|reason|added_by|inputs/);
  });

  it("returns a cursor only when more rows exist, and drops the cursor key from rows", async () => {
    const three = [{ asOf: "2026-10-03", total: 1, cursorKey: "2026-10-03" }, { asOf: "2026-10-02", total: 1, cursorKey: "2026-10-02" }, { asOf: "2026-10-01", total: 1, cursorKey: "2026-10-01" }];
    const more = await scoreHistory(fake(three).db, "NVDA", { limit: 2 });
    expect(more.rows).toEqual([{ asOf: "2026-10-03", total: 1 }, { asOf: "2026-10-02", total: 1 }]);
    expect(more.nextCursor).toBe("2026-10-02");
    expect((await scoreHistory(fake(three.slice(0, 2)).db, "NVDA", { limit: 2 })).nextCursor).toBeNull();
  });

  it("caps limit and rejects bad input", async () => {
    const a = fake();
    await scoreHistory(a.db, "NVDA", { limit: 10_000 });
    expect(a.calls[0].params[4]).toBe(501);
    await expect(scoreHistory(a.db, "NVDA", { limit: 0 })).rejects.toThrow(/limit/);
    await expect(scoreHistory(a.db, "NVDA", { from: "2026-02-30" })).rejects.toThrow(/from/);
    await expect(scoreHistory(a.db, "NVDA", { cursor: "x" })).rejects.toThrow(/cursor/);
    await expect(fundamentalsHistory(a.db, "NVDA", "Revenues", { cursor: "2026-10-01" })).rejects.toThrow(/cursor/);
    await expect(universeAsOf(a.db, "nope")).rejects.toThrow(/date/);
  });

  it("converts numeric strings from Postgres to numbers", async () => {
    const out = await fundamentalsHistory(fake([{ concept: "Revenues", value: "1234.5", cursorKey: "2026-10-01:1" }]).db, "NVDA", "Revenues");
    expect(out.rows[0].value).toBe(1234.5);
  });
});
