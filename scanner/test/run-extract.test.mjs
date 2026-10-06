import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parseClaudeEnvelope, addUsage, postTicker } from "../run-extract.mjs";

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

test("postTicker stores one ticker per call with macro=skip and reports failure", async () => {
  const calls = [];
  const real = globalThis.fetch;
  const logs = [];
  try {
    globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: calls.length === 2 ? 500 : 200 }); };
    const opts = { baseUrl: "http://x", agent: "claude" };
    const out = (symbol) => ({ symbol });
    assert.equal(await postTicker(opts, "t", { asOf: "2026-10-05", model: "m", output: out("NVDA") }, (m) => logs.push(m)), true);
    assert.equal(await postTicker(opts, "t", { asOf: "2026-10-05", model: "m", output: out("AMD") }, (m) => logs.push(m)), false);
    assert.equal(calls[0].url, "http://x/api/ingest/scan?macro=skip");
    assert.deepEqual(calls.map((c) => c.body.tickers.map((t) => t.symbol)), [["NVDA"], ["AMD"]]);
    assert.notEqual(calls[0].body.runId, calls[1].body.runId);
    assert.match(logs[1], /AMD: POST failed: HTTP 500/);
    globalThis.fetch = async () => { throw new Error("boom"); };
    assert.equal(await postTicker(opts, "t", { asOf: "2026-10-05", model: "m", output: out("X") }, (m) => logs.push(m)), false);
  } finally { globalThis.fetch = real; }
});
