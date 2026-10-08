import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parseClaudeEnvelope, addUsage, postTicker, materialChange, loadRuntimeUniverse, callAgentNoTools } from "../run-extract.mjs";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dailyTokenCeiling } from "../ai-budget.mjs";

const envelope = (over = {}) => JSON.stringify({ type: "result", is_error: false, result: "{}", num_turns: 1, total_cost_usd: 0.012, usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: 7, cache_creation_input_tokens: 8 }, modelUsage: { "claude-haiku-4-5": {} }, permission_denials: [], ...over });

test("claude defaults to haiku, codex has no default, and --force parses", () => {
  assert.equal(parseArgs([]).model, "haiku");
  assert.equal(parseArgs(["--model", "sonnet"]).model, "sonnet");
  assert.equal(parseArgs(["--agent", "codex"]).model, null);
  assert.equal(parseArgs([]).force, false);
  assert.equal(parseArgs(["--force"]).force, true);
});

test("daily ceiling defaults off and rejects invalid values", () => {
  assert.equal(dailyTokenCeiling({}), 0);
  assert.equal(dailyTokenCeiling({ AI_DAILY_TOKEN_CEILING: "25000" }), 25000);
  assert.throws(() => dailyTokenCeiling({ AI_DAILY_TOKEN_CEILING: "-1" }), /nonnegative integer/);
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
  assert.throws(() => parseClaudeEnvelope(envelope({ is_error: true, result: "rate limited" }), "haiku"), (e) => e.exitCode === 5);
  assert.throws(() => parseClaudeEnvelope(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), "haiku"), (e) => e.exitCode === 5);
  assert.throws(() => parseClaudeEnvelope("not json", "haiku"), /not JSON/);
});

test("addUsage sums and keeps never-reported fields null", () => {
  const a = { inputTokens: 1, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null, turns: 1 };
  const b = { inputTokens: 2, outputTokens: null, cacheReadTokens: 3, cacheCreationTokens: null, turns: 1 };
  assert.deepEqual(addUsage(a, b), { inputTokens: 3, outputTokens: null, cacheReadTokens: 3, cacheCreationTokens: null, turns: 2 });
});

test("a quiet gate exits before token lookup or model call", () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-gate-"));
  const file = join(dir, "gate.json"); writeFileSync(file, JSON.stringify({ symbols: [] }));
  const run = spawnSync(process.execPath, [new URL("../run-extract.mjs", import.meta.url).pathname, "--symbols-file", file], { env: { ...process.env, INGEST_TOKEN: "", SCAN_OUT_DIR: dir }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /nothing changed; 0 model calls/);
});

test("daily ceiling stops before a second model call with exit 5", () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-ceiling-"));
  const bundles = join(dir, "bundles"); mkdirSync(bundles);
  for (const symbol of ["NVDA", "AMD"]) writeFileSync(join(bundles, `${symbol}.json`), JSON.stringify({ symbol, documents: [], facts: [{ key: "dummy", asOf: "2026-10-01", value: 1 }] }));
  const gate = join(dir, "gate.json"); writeFileSync(gate, JSON.stringify({ symbols: ["NVDA", "AMD"] }));
  const cli = join(dir, "claude");
  writeFileSync(cli, `#!/usr/bin/env node
const fs = require("fs"); const p = fs.readFileSync(0, "utf8"); const symbol = p.match(/Company: [^\\n]+ \\(([A-Z]+)\\)/)[1];
fs.appendFileSync(${JSON.stringify(join(dir, "calls"))}, symbol + "\\n");
const fundamentals = Object.fromEntries(["revenueAccelerating","revenueDeclining","epsBeat","guidanceRaised","guidanceCut","productCatalyst","insiderOrInstitutionalBuying","narrativeChanged"].map(k => [k, null]));
process.stdout.write(JSON.stringify({ is_error:false, result:JSON.stringify({ symbol, fundamentals, evidence:[], confidence:"low" }), num_turns:1, total_cost_usd:0.01, usage:{input_tokens:10,output_tokens:10}, modelUsage:{haiku:{}} }));
`);
  chmodSync(cli, 0o755);
  const run = spawnSync(process.execPath, [new URL("../run-extract.mjs", import.meta.url).pathname, "--dry-run", "--symbols-file", gate, "--bundle-dir", bundles, "--as-of", "2026-10-05"], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, INGEST_TOKEN: "", SCAN_OUT_DIR: dir, AI_DAILY_TOKEN_CEILING: "15" }, encoding: "utf8" });
  assert.equal(run.status, 5, run.stderr);
  assert.match(run.stderr, /DAILY TOKEN CEILING: 20\/15 tokens after 1 tickers/);
  assert.equal(readFileSync(join(dir, "calls"), "utf8").trim().split("\n").length, 1);
});

test("the live extractor accepts an instrument supplied by the database universe endpoint", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "http://web/api/ingest/universe");
      assert.equal(options.headers.Authorization, "Bearer token");
      return Response.json({ instruments: [{ symbol: "F7ZZ", name: "New Company", sector: "Biotech", tier: null }] });
    };
    assert.deepEqual((await loadRuntimeUniverse("http://web", "token")).map((row) => row.symbol), ["F7ZZ"]);
  } finally { globalThis.fetch = previous; }
});

test("haiku escalation is limited to material changes", () => {
  assert.equal(materialChange({ fundamentals: { guidanceCut: true } }), true);
  assert.equal(materialChange({ fundamentals: { revenueDeclining: true } }), true);
  assert.equal(materialChange({ fundamentals: { guidanceCut: false, narrativeChanged: false }, evidence: [] }), false);
});

test("three gated tickers make three model calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-three-"));
  const bundles = join(dir, "bundles"); mkdirSync(bundles);
  const symbols = ["NVDA", "AMD", "AVGO"];
  for (const symbol of symbols) writeFileSync(join(bundles, `${symbol}.json`), JSON.stringify({ symbol, documents: [], facts: [{ key: "dummy", asOf: "2026-10-01", value: 1 }] }));
  const gate = join(dir, "gate.json"); writeFileSync(gate, JSON.stringify({ symbols }));
  const cli = join(dir, "claude");
  writeFileSync(cli, `#!/usr/bin/env node
const fs = require("fs"); const p = fs.readFileSync(0, "utf8"); const symbol = p.match(/Company: [^\\n]+ \\(([A-Z]+)\\)/)[1];
fs.appendFileSync(${JSON.stringify(join(dir, "calls"))}, symbol + "\\n");
const fundamentals = Object.fromEntries(["revenueAccelerating","revenueDeclining","epsBeat","guidanceRaised","guidanceCut","productCatalyst","insiderOrInstitutionalBuying","narrativeChanged"].map(k => [k, null]));
process.stdout.write(JSON.stringify({ is_error:false, result:JSON.stringify({ symbol, fundamentals, evidence:[], confidence:"low" }), num_turns:1, total_cost_usd:0.01, usage:{input_tokens:10,output_tokens:10}, modelUsage:{haiku:{}} }));
`);
  chmodSync(cli, 0o755);
  const run = spawnSync(process.execPath, [new URL("../run-extract.mjs", import.meta.url).pathname, "--dry-run", "--symbols-file", gate, "--bundle-dir", bundles, "--as-of", "2026-10-05"], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, INGEST_TOKEN: "", SCAN_OUT_DIR: dir }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readFileSync(join(dir, "calls"), "utf8").trim().split("\n"), symbols);
  assert.match(run.stderr, /totals: 3 model calls/);
});

test("a fake Claude five-hour cutoff stops extraction with exit 5 and no retry", () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-cutoff-"));
  const bundles = join(dir, "bundles"); mkdirSync(bundles);
  writeFileSync(join(bundles, "NVDA.json"), JSON.stringify({ symbol: "NVDA", documents: [], facts: [{ key: "dummy", asOf: "2026-10-01", value: 1 }] }));
  const gate = join(dir, "gate.json"); writeFileSync(gate, JSON.stringify({ symbols: ["NVDA"] }));
  const cli = join(dir, "claude");
  writeFileSync(cli, `#!/usr/bin/env node
const fs = require("fs"); fs.appendFileSync(${JSON.stringify(join(dir, "calls"))}, "call\\n");
process.stdout.write(JSON.stringify({ is_error: true, result: "5-hour usage limit reached; resets at 2026-10-07T15:00:00Z" }));
`);
  chmodSync(cli, 0o755);
  const run = spawnSync(process.execPath, [new URL("../run-extract.mjs", import.meta.url).pathname, "--dry-run", "--symbols-file", gate, "--bundle-dir", bundles, "--as-of", "2026-10-05"], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, INGEST_TOKEN: "", SCAN_OUT_DIR: dir }, encoding: "utf8" });
  assert.equal(run.status, 5, run.stderr);
  assert.match(run.stderr, /ANTHROPIC CUTOFF: 5h resets 2026-10-07T15:00:00.000Z after 0 tickers/);
  assert.equal(readFileSync(join(dir, "calls"), "utf8").trim().split("\n").length, 1);
});

test("a nonzero Claude CLI exit with 429 on stderr is a cutoff", async () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-429-"));
  const cli = join(dir, "claude");
  writeFileSync(cli, "#!/bin/sh\necho 'HTTP 429 too many requests' >&2\nexit 1\n");
  chmodSync(cli, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${dir}:${oldPath}`;
  try { await assert.rejects(callAgentNoTools({ agent: "claude", model: "haiku", timeoutS: 5, budgetUsd: 0.5 }, "prompt", dir), (e) => e.exitCode === 5 && e.cutoff.window === "rate limit"); }
  finally { process.env.PATH = oldPath; }
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
    assert.equal(calls[0].body.runner.dataMode, "real");
    assert.equal(await postTicker({ ...opts, bundleDir: "/tmp/sample" }, "t", { asOf: "2026-10-05", model: "m", output: out("TSLA") }, () => {}), true);
    assert.equal(calls[2].body.runner.dataMode, "sample");
    assert.match(logs[1], /AMD: POST failed: HTTP 500/);
    globalThis.fetch = async () => { throw new Error("boom"); };
    assert.equal(await postTicker(opts, "t", { asOf: "2026-10-05", model: "m", output: out("X") }, (m) => logs.push(m)), false);
  } finally { globalThis.fetch = real; }
});

test("unknown token usage has a conservative local floor", async () => {
  const { unknownUsageTokens } = await import("../run-extract.mjs");
  assert.equal(unknownUsageTokens({}), 20000);
  assert.equal(unknownUsageTokens({ AI_UNKNOWN_USAGE_TOKENS: "24000" }), 24000);
  assert.throws(() => unknownUsageTokens({ AI_UNKNOWN_USAGE_TOKENS: "0" }));
});
