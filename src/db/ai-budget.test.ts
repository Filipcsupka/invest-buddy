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

it("serializes research reservations and rejects an overlapping call", async () => {
  const sql: string[] = [];
  const client = { query: async (statement: string) => {
    sql.push(statement);
    if (statement.includes("count(*)::text")) return { rows: [{ count: "1" }] };
    if (statement.includes("WITH clock")) return { rows: [{ day: "2026-10-11", month: "2026-10", monthly_tokens: "10", monthly_usd: "0", daily_calls: "1", daily_tokens: "10", shared_daily_tokens: "10" }] };
    return { rows: [] };
  }, release: () => {} };
  const db = { query: client.query, connect: async () => client };
  const result = await reserveCall(db as never, { id: "00000000-0000-4000-8000-000000000021", kind: "research", agent: "claude", authSource: "subscription", model: "sonnet", caps: { monthlyTokens: 1000, monthlyUsd: 0, dailyCalls: 4, dailyTokens: 500, sharedDailyTokens: 1000 } });
  expect(result).toEqual({ recorded: false });
  expect(sql).toContain("SELECT pg_advisory_xact_lock(77853)");
  expect(sql.some((statement) => statement.includes("INSERT INTO ai_budget_calls"))).toBe(false);
});

const caps = { monthlyTokens: 1000, monthlyUsd: 0, dailyCalls: 9, dailyTokens: 500, sharedDailyTokens: 0 };
const research = (id: string, overrideCaps?: { dailyCalls: number; monthlyCalls: number }) => ({ id, kind: "research" as const, agent: "claude" as const, authSource: "subscription" as const, model: "sonnet", caps, overrideCaps });

it("research reservation has no token or call cap and only refuses while another research call is active", async () => {
  for (const [active, recorded] of [["0", true], ["1", false]] as const) {
    const sql: string[] = [];
    const client = { query: async (statement: string) => { sql.push(statement); return statement.includes("count(*)::text") ? { rows: [{ count: active }] } : { rows: [] }; }, release: () => {} };
    const db = { query: client.query, connect: async () => client };
    expect(await reserveCall(db as never, research("00000000-0000-4000-8000-000000000031"))).toEqual({ recorded });
    expect(sql.some((statement) => statement.includes("INSERT INTO ai_budget_calls"))).toBe(recorded);
    expect(sql.some((statement) => statement.includes("WITH clock"))).toBe(false);
  }
});
