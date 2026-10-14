import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, parseArgs } from "../run-research.mjs";

process.env.INGEST_TOKEN = "test-token";
const today = new Date().toISOString().slice(0, 10);
const capUsage = async () => ({ day: today, month: today.slice(0, 7), monthlyTokens: 0, monthlyUsd: 0, dailyCalls: 0, monthlyCalls: 0, dailyTokens: 0, sharedDailyTokens: 0 });
const baseEnv = (extra = {}) => ({ INGEST_TOKEN: "t", RESEARCH_ENABLED: "on", RESEARCH_WINDOW: "00:00-23:59", RESEARCH_QUOTA_UNKNOWN_OVERRIDE: "on", CLAUDE_CODE_OAUTH_TOKEN: "x", RESEARCH_OUT_DIR: mkdtempSync(join(tmpdir(), "ro-out-")), ...extra });
const setup = (type = "weekly") => {
  const dir = mkdtempSync(join(tmpdir(), "ro-in-"));
  const inputFile = join(dir, "input.json");
  writeFileSync(inputFile, JSON.stringify({ symbols: ["SMPL"], triggers: [], knownFacts: [], openCandidates: [] }));
  return parseArgs(["--type", type, "--as-of", today, "--input-file", inputFile, "--dry-run", "--base-url", "http://unused"], {});
};
const adapterWith = (runs) => ({
  name: "claude", authSource: () => "subscription", quota: async () => null,
  async run(args) { runs.push(args); return { text: JSON.stringify({ findings: [], candidates: [], chains: [], notes: null }), usage: null, cutoff: null, model: "sonnet", costUsd: null }; },
});
const unknown403 = async () => ({ unavailable: "403" });

test("execute passes runCalls to the gate: per-run override cap stops the second group", async () => {
  const runs = [];
  const results = await execute(setup(), { adapter: adapterWith(runs), env: baseEnv({ RESEARCH_OVERRIDE_RUN_CALLS: "1" }), usage: capUsage, liveUsage: unknown403 });
  assert.equal(runs.length, 1);
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.skipped ?? null), [null, "skipped_quota", "skipped_quota"]);
});

test("default caps let a weekly run make three calls", async () => {
  const runs = [];
  const results = await execute(setup(), { adapter: adapterWith(runs), env: baseEnv(), usage: capUsage, liveUsage: unknown403 });
  assert.equal(runs.length, 3);
  assert.equal(results.filter((r) => r.skipped).length, 0);
});

test("monitor continues on 403 for an override run, stops for a run gated by a known reading", async () => {
  let runs = [];
  await execute(setup("daily"), { adapter: adapterWith(runs), env: baseEnv(), usage: capUsage, liveUsage: unknown403 });
  assert.equal(typeof runs[0].monitor, "function");
  assert.equal((await runs[0].monitor()).ok, true);

  const known = async () => ({ usage: { fiveHour: { pct: 10 }, sevenDay: { pct: 10 } } });
  // Gate had a reading, so a later unknown reading must stop the run.
  let calls = 0;
  runs = [];
  const flaky = async () => (calls++ === 0 ? await known() : { unavailable: "403" });
  await execute(setup("daily"), { adapter: adapterWith(runs), env: baseEnv(), usage: capUsage, liveUsage: flaky });
  assert.equal((await runs[0].monitor()).ok, false);
});

test("a non-403 failure skips the run even with the override on", async () => {
  const runs = [];
  const results = await execute(setup("daily"), { adapter: adapterWith(runs), env: baseEnv(), usage: capUsage, liveUsage: async () => ({ unavailable: "429" }) });
  assert.equal(runs.length, 0);
  assert.equal(results[0].skipped, "skipped_quota");
});
