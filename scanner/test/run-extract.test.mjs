import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parseClaudeEnvelope, addUsage } from "../run-extract.mjs";

const envelope = (over = {}) => JSON.stringify({ type: "result", is_error: false, result: "{}", num_turns: 1, total_cost_usd: 0.012, usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: 7, cache_creation_input_tokens: 8 }, modelUsage: { "claude-haiku-4-5": {} }, permission_denials: [], ...over });

test("claude defaults to haiku, codex has no default, --force and --budget-usd parse", () => {
  assert.equal(parseArgs([]).model, "haiku");
  assert.equal(parseArgs(["--model", "sonnet"]).model, "sonnet");
  assert.equal(parseArgs(["--agent", "codex"]).model, null);
  assert.equal(parseArgs([]).force, false);
  assert.equal(parseArgs(["--force"]).force, true);
  assert.equal(parseArgs([]).budgetUsd, 0.5);
  assert.equal(parseArgs(["--budget-usd", "0.1"]).budgetUsd, 0.1);
});

test("envelope gives text, model, usage and cost", () => {
  const r = parseClaudeEnvelope(envelope(), "haiku");
  assert.equal(r.text, "{}");
  assert.equal(r.model, "claude-haiku-4-5");
  assert.deepEqual(r.usage, { inputTokens: 5, outputTokens: 6, cacheReadTokens: 7, cacheCreationTokens: 8, turns: 1 });
  assert.equal(r.costUsd, 0.012);
});

test("more than one turn or a permission denial is rejected as tool use", () => {
  assert.throws(() => parseClaudeEnvelope(envelope({ num_turns: 2 }), "haiku"), /tool use is not allowed/);
  assert.throws(() => parseClaudeEnvelope(envelope({ permission_denials: [{ tool_name: "WebFetch" }] }), "haiku"), /tool use is not allowed/);
});

test("error envelopes and non-JSON fail", () => {
  assert.throws(() => parseClaudeEnvelope(envelope({ is_error: true, result: "rate limited" }), "haiku"), /claude error: rate limited/);
  assert.throws(() => parseClaudeEnvelope("not json", "haiku"), /not JSON/);
});

test("addUsage sums and keeps never-reported fields null", () => {
  const a = { inputTokens: 1, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null, turns: 1 };
  const b = { inputTokens: 2, outputTokens: null, cacheReadTokens: 3, cacheCreationTokens: null, turns: 1 };
  assert.deepEqual(addUsage(a, b), { inputTokens: 3, outputTokens: null, cacheReadTokens: 3, cacheCreationTokens: null, turns: 2 });
});

test("empty detector list exits before auth, bundle, or model call", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "empty-detect-"));
  try {
    const symbolsFile = join(dir, "detect.json");
    writeFileSync(symbolsFile, JSON.stringify({ asOf: "2026-10-09", symbols: [], reasons: {} }));
    const result = spawnSync(process.execPath, [new URL("../run-extract.mjs", import.meta.url).pathname, "--symbols-file", symbolsFile], { encoding: "utf8", env: { ...process.env, INGEST_TOKEN: "", PATH: dir, SCAN_OUT_DIR: dir } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /nothing to extract/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
