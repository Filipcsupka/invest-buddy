import test from "node:test";
import assert from "node:assert/strict";
import { checkResearchCaps } from "../research-caps.mjs";
import { runCli } from "../run-scan.mjs";

const liveUsage = (pct) => async () => ({ usage: { fiveHour: { pct }, sevenDay: { pct } } });
const check = (env, override = {}) => checkResearchCaps({ env: { RESEARCH_ENABLED: "on", ...env }, liveUsage: liveUsage(10), ...override });

test("kill switch fails closed when unset or off", async () => {
  for (const value of [undefined, "off"]) assert.equal((await check({ RESEARCH_ENABLED: value })).status, "killed");
});

test("no token, call, USD or window caps: a run goes ahead at any hour with any usage history", async () => {
  assert.equal((await check({ RESEARCH_WINDOW: "00:00-01:00", RESEARCH_DAILY_TOKENS: "1", RESEARCH_MONTHLY_TOKENS: "1", RESEARCH_DAILY_CALLS: "0" })).ok, true);
});

test("claude stops only at the real 90 percent five-hour or seven-day limit", async () => {
  assert.equal((await check({}, { liveUsage: liveUsage(89) })).ok, true);
  assert.equal((await check({}, { liveUsage: liveUsage(90) })).status, "skipped_quota");
  assert.equal((await check({}, { liveUsage: async () => ({ usage: { fiveHour: { pct: 10 }, sevenDay: { pct: 95 } } }) })).status, "skipped_quota");
});

test("an unreadable quota (403, 429, malformed) does not stop a run", async () => {
  assert.equal((await check({}, { liveUsage: async () => ({ unavailable: "403" }) })).ok, true);
  assert.equal((await check({}, { liveUsage: async () => ({ unavailable: "429" }) })).ok, true);
  assert.equal((await check({}, { liveUsage: async () => ({ usage: { fiveHour: {}, sevenDay: { pct: 10 } } }) })).ok, true);
});

test("an in-flight quota stop terminates the model process", async () => {
  await assert.rejects(runCli(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], "", {
    cwd: process.cwd(), timeoutMs: 2000, monitorIntervalMs: 20,
    monitor: async () => ({ ok: false, reason: "five-hour quota at 90%" }),
  }), (error) => error.cutoff?.window === "5h");
});
