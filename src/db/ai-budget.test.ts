import { expect, it } from "vitest";
import { dailyTokenUsage, finishCall, monthStart, reserveCall, unknownUsageTokens } from "./ai-budget";

it("records calls without a monthly cap", async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const db = { query: async (sql: string, values: unknown[]) => { queries.push({ sql, values }); return { rows: [] }; } };
  expect(await reserveCall(db as never, { id: "00000000-0000-4000-8000-000000000020", kind: "judge", agent: "claude", authSource: "subscription", model: "sonnet" })).toEqual({ recorded: true });
  expect(queries[0].sql).toContain("INSERT INTO ai_budget_calls");
  expect(queries[0].values).toContain("sonnet");
  expect(monthStart(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-01");
});

it("counts completed subscription usage for the current UTC day", async () => {
  const calls: string[] = [];
  const db = { query: async (sql: string) => { calls.push(sql); return { rows: [{ tokens: "125" }] }; } };
  expect(await dailyTokenUsage(db as never)).toBe(125);
  expect(calls[0]).toContain("auth_source='subscription'");
  expect(calls[0]).toContain("completed_at IS NOT NULL");
});

it("charges an unknown usage floor instead of zero", async () => {
  const values: unknown[][] = [];
  const db = { query: async (_sql: string, params: unknown[]) => { values.push(params); return { rowCount: 1 }; } };
  expect(unknownUsageTokens({} as NodeJS.ProcessEnv)).toBe(20000);
  await finishCall(db as never, { id: "x", tokens: null, usd: null });
  expect(values[0][1]).toBe(20000);
});

it("research reservation records calls without checking usage or other active calls", async () => {
  const sql: string[] = [];
  const db = { query: async (statement: string) => { sql.push(statement); return { rows: [] }; } };
  const result = await reserveCall(db as never, { id: "00000000-0000-4000-8000-000000000021", kind: "research", agent: "claude", authSource: "subscription", model: "sonnet" });
  expect(result).toEqual({ recorded: true });
  expect(sql).toHaveLength(1);
  expect(sql[0]).toContain("INSERT INTO ai_budget_calls");
});
