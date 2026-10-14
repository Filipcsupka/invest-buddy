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
const usageRow = (daily: number, monthly: number) => ({ day: "2026-10-11", month: "2026-10", monthly_tokens: "0", monthly_usd: "0", daily_calls: String(daily), monthly_calls: String(monthly), codex_daily_calls: "0", daily_tokens: "0", shared_daily_tokens: "0" });
const fakeDb = (daily: number, monthly: number) => {
  const sql: string[] = [];
  const client = { query: async (statement: string) => {
    sql.push(statement);
    if (statement.includes("count(*)::text")) return { rows: [{ count: "0" }] };
    if (statement.includes("WITH clock")) return { rows: [usageRow(daily, monthly)] };
    return { rows: [] };
  }, release: () => {} };
  return { sql, db: { query: client.query, connect: async () => client } };
};

it("research cap SQL counts monthly calls", async () => {
  const { sql, db } = fakeDb(0, 0);
  await reserveCall(db as never, research("00000000-0000-4000-8000-000000000030"));
  const usageSql = sql.find((statement) => statement.includes("WITH clock")) ?? "";
  expect(usageSql).toContain("AS monthly_calls");
  expect(usageSql).toContain("count(*) FILTER (WHERE calls.kind='research' AND calls.local_day >= date_trunc('month'");
});

it("enforces override call caps inside the reservation transaction", async () => {
  const ov = { dailyCalls: 3, monthlyCalls: 20 };
  for (const [daily, monthly, recorded] of [[2, 19, true], [3, 5, false], [0, 20, false]] as const) {
    const { sql, db } = fakeDb(daily, monthly);
    expect(await reserveCall(db as never, research("00000000-0000-4000-8000-000000000031", ov))).toEqual({ recorded });
    expect(sql.some((statement) => statement.includes("INSERT INTO ai_budget_calls"))).toBe(recorded);
    expect(sql.indexOf("COMMIT")).toBeGreaterThan(sql.indexOf("SELECT pg_advisory_xact_lock(77853)"));
  }
  // Without overrideCaps the same counts are not capped by the override.
  const { db } = fakeDb(3, 20);
  expect(await reserveCall(db as never, research("00000000-0000-4000-8000-000000000032"))).toEqual({ recorded: true });
});

it("two concurrent reservations at the override cap record only one", async () => {
  let rows = 0;
  let tail: Promise<void> = Promise.resolve();
  const makeClient = () => {
    let release: () => void = () => {};
    return {
      query: async (statement: string) => {
        if (statement.includes("pg_advisory_xact_lock")) { const prev = tail; tail = new Promise<void>((resolve) => { release = resolve; }); await prev; return { rows: [] }; }
        if (statement.includes("count(*)::text")) return { rows: [{ count: "0" }] };
        if (statement.includes("WITH clock")) { await new Promise((resolve) => setTimeout(resolve, 5)); return { rows: [usageRow(rows, rows)] }; }
        if (statement.includes("INSERT INTO ai_budget_calls")) rows += 1;
        if (statement === "COMMIT" || statement === "ROLLBACK") release();
        return { rows: [] };
      },
      release: () => {},
    };
  };
  const db = { query: async () => ({ rows: [] }), connect: async () => makeClient() };
  const ov = { dailyCalls: 1, monthlyCalls: 20 };
  const results = await Promise.all([
    reserveCall(db as never, research("00000000-0000-4000-8000-000000000033", ov)),
    reserveCall(db as never, research("00000000-0000-4000-8000-000000000034", ov)),
  ]);
  expect(results.filter((result) => result.recorded)).toHaveLength(1);
  expect(rows).toBe(1);
});
