import test from "node:test";
import assert from "node:assert/strict";
import { checkResearchCaps } from "../research-caps.mjs";
import { runCli } from "../run-scan.mjs";

const now = new Date("2026-10-11T01:00:00Z");
const usage = { day: "2026-10-11", month: "2026-10", monthlyTokens: 10, monthlyUsd: 1, dailyCalls: 0, dailyTokens: 10, sharedDailyTokens: 10 };
const liveUsage = async () => ({ usage: { fiveHour: { pct: 10 }, sevenDay: { pct: 10 } } });
const check = (env, override = {}) => checkResearchCaps({ env: { RESEARCH_ENABLED: "on", ...env }, now, type: "daily", usage, liveUsage, ...override });

test("kill switch fails closed when unset or off", async () => {
  for (const value of [undefined, "off"]) assert.equal((await check({ RESEARCH_ENABLED: value })).status, "killed");
});
test("each cap stops before the model call with its status", async () => {
  const cases = [
    [{ RESEARCH_WINDOW: "04:00-07:00" }, {}, "skipped_window"],
    [{ RESEARCH_MONTHLY_TOKENS: "10" }, {}, "skipped_cap"],
    [{ RESEARCH_MONTHLY_USD: "1" }, { authSource: "api" }, "skipped_cap"],
    [{ RESEARCH_DAILY_CALLS: "0" }, {}, "skipped_cap"],
    [{ RESEARCH_DAILY_TOKENS: "10" }, {}, "skipped_cap"],
    [{ AI_DAILY_TOKEN_CEILING: "10" }, {}, "skipped_cap"],
    [{ RESEARCH_QUOTA_STOP_5H_PCT: "10" }, {}, "skipped_quota"],
    [{ RESEARCH_QUOTA_STOP_7D_PCT: "10" }, { liveUsage: async () => ({ usage: { fiveHour: { pct: 0 }, sevenDay: { pct: 10 } } }) }, "skipped_quota"],
  ];
  for (const [env, override, expected] of cases) assert.equal((await check(env, override)).status, expected);
});
test("monthly cap resets with the usage month", async () => {
  const october = { ...usage, monthlyTokens: 100 };
  assert.equal((await check({ RESEARCH_MONTHLY_TOKENS: "100" }, { usage: october })).status, "skipped_cap");
  const november = new Date("2026-11-01T01:00:00Z");
  assert.equal((await check({ RESEARCH_MONTHLY_TOKENS: "100" }, { now: november, usage: { ...usage, day: "2026-11-01", month: "2026-11" } })).ok, true);
});
test("manual deep dive bypasses only the clock window", async () => {
  const outside = new Date("2026-10-11T11:00:00Z");
  assert.equal((await check({}, { now: outside, type: "deepdive", manual: true })).ok, true);
  assert.equal((await check({ RESEARCH_QUOTA_STOP_5H_PCT: "10" }, { now: outside, type: "deepdive", manual: true })).status, "skipped_quota");
});

test("missing usage or malformed live quota fails closed", async () => {
  assert.equal((await check({}, { usage: { ...usage, dailyCalls: null } })).status, "skipped_cap");
  assert.equal((await check({}, { liveUsage: async () => ({ usage: { fiveHour: {}, sevenDay: { pct: 10 } } }) })).status, "skipped_quota");
});

test("an in-flight quota stop terminates the model process", async () => {
  await assert.rejects(runCli(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], "", {
    cwd: process.cwd(), timeoutMs: 2000, monitorIntervalMs: 20,
    monitor: async () => ({ ok: false, reason: "five-hour quota at 70%" }),
  }), (error) => error.cutoff?.window === "5h");
});
