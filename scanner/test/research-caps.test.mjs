import test from "node:test";
import assert from "node:assert/strict";
import { checkResearchCaps } from "../research-caps.mjs";
const check = (env, override = {}) => checkResearchCaps({ env: { RESEARCH_ENABLED: "on", ...env }, ...override });

test("kill switch fails closed when unset or off", async () => {
  for (const value of [undefined, "off"]) assert.equal((await check({ RESEARCH_ENABLED: value })).status, "killed");
});

test("no token, call, USD or window caps: a run goes ahead at any hour with any usage history", async () => {
  assert.equal((await check({ RESEARCH_WINDOW: "00:00-01:00", RESEARCH_DAILY_TOKENS: "1", RESEARCH_MONTHLY_TOKENS: "1", RESEARCH_DAILY_CALLS: "0" })).ok, true);
});

test("quota probes are never called", async () => {
  const unreadable = async () => { throw new Error("quota probe must not run"); };
  assert.equal((await check({}, { liveUsage: unreadable, codexQuota: unreadable })).ok, true);
});
