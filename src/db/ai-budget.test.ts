import { expect, it } from "vitest";
import { monthStart, reserveCall } from "./ai-budget";

it("records calls without a monthly cap", async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const db = { query: async (sql: string, values: unknown[]) => { queries.push({ sql, values }); return { rows: [] }; } };
  expect(await reserveCall(db as never, { id: "00000000-0000-4000-8000-000000000020", kind: "judge", agent: "claude", authSource: "subscription", model: "sonnet" })).toEqual({ recorded: true });
  expect(queries[0].sql).toContain("INSERT INTO ai_budget_calls");
  expect(queries[0].values).toContain("sonnet");
  expect(monthStart(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-01");
});
