import test from "node:test";
import assert from "node:assert/strict";
import { checkResearchCaps, checkLiveResearchQuota, overrideLimits } from "../research-caps.mjs";
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

// RS8 follow-up: opt-in override when the usage endpoint gives no reading.
import { fetchLiveUsage } from "../claude-usage.mjs";
const fake403 = (status) => (token) => fetchLiveUsage(token, { fetcher: async () => ({ ok: false, status }) });
const fake200 = (pct) => (token) => fetchLiveUsage(token, { fetcher: async () => ({ ok: true, json: async () => ({ five_hour: { utilization: pct }, seven_day: { utilization: pct } }) }) });
const ovUsage = { ...usage, dailyCalls: 0, monthlyCalls: 0 };
const ov = (env, override = {}) => check({ RESEARCH_QUOTA_UNKNOWN_OVERRIDE: "on", ...env }, { usage: ovUsage, liveUsage: () => fake403(403)("tok"), ...override });

test("403 from the usage endpoint stops when the override is off or not exactly on", async () => {
  for (const value of [undefined, "off", "true", "1", "", "ON", " on", "on ", "On"]) {
    const r = await check({ RESEARCH_QUOTA_UNKNOWN_OVERRIDE: value }, { usage: ovUsage, liveUsage: () => fake403(403)("tok") });
    assert.equal(r.status, "skipped_quota");
  }
});
test("403 with the override on runs under hard caps", async () => {
  const r = await ov({});
  assert.equal(r.ok, true);
  assert.equal(r.override, true);
  assert.deepEqual(r.overrideCaps, { dailyCalls: 3, monthlyCalls: 20 });
});
test("override stops at the per-run, daily and monthly caps", async () => {
  assert.equal((await ov({}, { runCalls: 3 })).status, "skipped_quota");
  assert.equal((await ov({ RESEARCH_OVERRIDE_RUN_CALLS: "1" }, { runCalls: 1 })).status, "skipped_quota");
  assert.equal((await ov({ RESEARCH_DAILY_CALLS: "9" }, { usage: { ...ovUsage, dailyCalls: 3 } })).status, "skipped_quota");
  assert.equal((await ov({}, { usage: { ...ovUsage, monthlyCalls: 20 } })).status, "skipped_quota");
  assert.equal((await ov({ RESEARCH_OVERRIDE_MONTHLY_CALLS: "30" }, { usage: { ...ovUsage, monthlyCalls: 29 } })).ok, true);
  assert.equal((await ov({ RESEARCH_OVERRIDE_DAILY_CALLS: "0" })).status, "skipped_quota");
});
test("override fails closed when call counts or caps are unreadable", async () => {
  assert.equal((await ov({}, { usage: { ...ovUsage, monthlyCalls: undefined } })).status, "skipped_quota");
  assert.equal((await ov({}, { usage: { ...ovUsage, monthlyCalls: null } })).status, "skipped_quota");
  assert.equal((await ov({ RESEARCH_OVERRIDE_RUN_CALLS: "abc" })).status, "skipped_quota");
  assert.equal((await ov({ RESEARCH_OVERRIDE_DAILY_CALLS: "-1" })).status, "skipped_quota");
  assert.equal((await ov({}, { usage: null })).status, "skipped_cap");
});
test("a known reading is never bypassed by the override", async () => {
  assert.equal((await ov({}, { liveUsage: () => fake200(95)("tok") })).status, "skipped_quota");
  assert.equal((await ov({}, { liveUsage: () => fake200(10)("tok"), usage: { ...ovUsage, monthlyCalls: 999 } })).ok, true);
});
test("override does not relax the other caps, the window or the kill switch", async () => {
  assert.equal((await ov({ RESEARCH_DAILY_TOKENS: "10" })).status, "skipped_cap");
  assert.equal((await ov({ RESEARCH_DAILY_CALLS: "0" })).status, "skipped_cap");
  assert.equal((await ov({ RESEARCH_WINDOW: "04:00-07:00" })).status, "skipped_window");
  assert.equal((await ov({ RESEARCH_ENABLED: "off" })).status, "killed");
});
test("in-flight monitor lets an unknown reading continue only with the override on", async () => {
  const unknown = async () => ({ unavailable: "403" });
  assert.equal((await checkLiveResearchQuota({ env: {}, liveUsage: unknown, monitor: true })).ok, false);
  assert.equal((await checkLiveResearchQuota({ env: { RESEARCH_QUOTA_UNKNOWN_OVERRIDE: "on" }, liveUsage: unknown, monitor: true, override: true })).ok, true);
  assert.equal((await checkLiveResearchQuota({ env: { RESEARCH_QUOTA_UNKNOWN_OVERRIDE: "on" }, liveUsage: fake200(90).bind(null, "t") , monitor: true, override: true })).ok, false);
});

test("override applies only to a 403 reading, not other failures", async () => {
  for (const unavailable of ["401", "429", "500", "503", "request failed", "no token"]) {
    const r = await ov({}, { liveUsage: async () => ({ unavailable }) });
    assert.equal(r.status, "skipped_quota", unavailable);
  }
  assert.equal((await ov({}, { liveUsage: async () => ({ usage: { fiveHour: {}, sevenDay: { pct: 10 } } }) })).status, "skipped_quota");
  assert.equal((await ov({}, { liveUsage: async () => null })).status, "skipped_quota");
  assert.equal((await ov({}, { liveUsage: () => fake403(403)("tok") })).ok, true);
});
test("in-flight monitor keeps going on 403 only for a gate that was an override run", async () => {
  const unknown = async () => ({ unavailable: "403" });
  const env = { RESEARCH_QUOTA_UNKNOWN_OVERRIDE: "on" };
  assert.equal((await checkLiveResearchQuota({ env, liveUsage: unknown, monitor: true, override: true })).ok, true);
  assert.equal((await checkLiveResearchQuota({ env, liveUsage: unknown, monitor: true, override: false })).ok, false);
  assert.equal((await checkLiveResearchQuota({ env, liveUsage: unknown, monitor: true })).ok, false);
  assert.equal((await checkLiveResearchQuota({ env, liveUsage: async () => ({ unavailable: "429" }), monitor: true, override: true })).ok, false);
  assert.equal((await checkLiveResearchQuota({ env, liveUsage: fake200(90).bind(null, "t"), monitor: true, override: true })).ok, false);
});
test("default override daily cap fits a weekly run of three calls", () => {
  assert.equal(overrideLimits({}).runCalls, 3);
  assert.ok(overrideLimits({}).dailyCalls >= 3);
});
