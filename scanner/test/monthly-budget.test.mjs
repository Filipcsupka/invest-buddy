import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMonthlyBudget, expectedTokens, monthlyTokenCap, monthlyUsed } from "../monthly-budget.mjs";

test("monthly guard counts judge and research tokens of the current UTC month", async () => {
  const report = { tokensPerDayUtcByKind: { judge: { "2026-10-31": 900, "2026-11-01": 100 }, research: { "2026-11-06": 300 }, extract: { "2026-11-06": 5000000 } } };
  const now = new Date("2026-11-06T10:00:00Z");
  assert.equal(monthlyUsed(report, now), 400);
  assert.equal(expectedTokens(3000, { AI_EXPECTED_OUTPUT_TOKENS: "200" }), 1200);
  assert.equal(monthlyTokenCap({}), 2000000);
  const request = async () => ({ ok: true, json: async () => report });
  assert.deepEqual(await checkMonthlyBudget("http://x", "token", 500, { env: { AI_JUDGE_MONTHLY_TOKEN_CAP: "1000" }, request, now }), { used: 400, expected: 500, cap: 1000 });
  await assert.rejects(checkMonthlyBudget("http://x", "token", 601, { env: { AI_JUDGE_MONTHLY_TOKEN_CAP: "1000" }, request, now }), /monthly token cap/);
  await assert.rejects(checkMonthlyBudget("http://x", "token", 1100, { env: { AI_JUDGE_MONTHLY_TOKEN_CAP: "1000" }, request, now }), /exceeds monthly cap/);
});

test("monthly guard fails closed when usage is unavailable", async () => {
  await assert.rejects(checkMonthlyBudget("http://x", "token", 100, { request: async () => ({ ok: false, status: 503 }) }), /unavailable/);
  assert.throws(() => monthlyTokenCap({ AI_JUDGE_MONTHLY_TOKEN_CAP: "0" }), /positive integer/);
  await assert.rejects(checkMonthlyBudget("http://x", "token", 100, { request: async () => ({ ok: true, json: async () => ({}) }) }), /malformed/);
  await assert.rejects(checkMonthlyBudget("http://x", "token", 100, { request: async () => ({ ok: true, json: async () => ({ tokensPerDayUtcByKind: { judge: { "2026-11-01": -1 } } }) }) }), /malformed/);
});
