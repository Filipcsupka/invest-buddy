import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, validateJudgeOutput, normalizeOutput, changedSignals, mergeIdeas, buildModelInput, inventedFigures, judgeHash, agentModeArgs, parseAgentEnvelope, amountText } from "../run-judge.mjs";
import { callAgentNoTools } from "../run-extract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "..", "run-judge.mjs");
const U1 = "https://www.sec.gov/Archives/edgar/data/1045810/nvda-8k-ex99.htm", U2 = "https://www.sec.gov/Archives/edgar/data/1045810/nvda-10q.htm", U3 = "https://www.sec.gov/Archives/edgar/data/2488/amd-8k.htm";

const sig = (symbol, over = {}) => ({ symbol, action: "ADD", sizeTier: "ADD_THIRD", amountMinEur: 60, amountMaxEur: 90, ratings: { company: "Very strong", entry: "Strong", catalyst: "Good" }, points: { company: 6, entry: 4, catalyst: 2 }, unconfirmed: false, carriedFrom: null, confirmedFields: ["epsBeat", "revenueAccelerating"], reasons: ["Fundamentals hold and the entry is good."], ownerNotes: [], ruleConfigVersion: "2026-10-06.1", signature: `${over.action ?? "ADD"}|Very strong|Strong|Good|${over.sizeTier ?? "ADD_THIRD"}`, ...over });
const ctx = (symbol, evidence, held = null) => ({ symbol, name: symbol, sector: "AI", tier: 1, held, score: { total: 19, technical: 9, fundamentals: 7, macro: 3, state: "Setup met (>=18)", pullbackInUptrend: true, asOf: "2026-10-05" }, invalidReasons: [], technicals: { close: 120.5, belowHigh20Percent: 7.4, rsi14: 48.2, regime: "pullback" }, matchedRules: [], fields: {}, expiredFields: [], carriedFrom: null, evidence: evidence.map((url) => ({ url, field: "epsBeat", publishedAt: "2026-10-01", quote: "q" })) });
// Synthetic baseline, test only.
const input = (over = {}) => ({
  asOf: "2026-10-05", generatedAt: "2026-10-05T20:00:00.000Z", ruleConfigVersion: "2026-10-06.1",
  benchmark: { symbol: "CSPX", description: "S&P 500 UCITS ETF" },
  portfolio: { asOf: "2026-10-05", source: "manual", currency: "EUR", cashEur: 600, monthlyContributionEur: 200, investedEur: 3030, positions: [{ symbol: "NVDA", valueEur: 540 }, { symbol: "CSPX", valueEur: 2100 }] },
  symbols: [ctx("NVDA", [U1, U2], { valueEur: 540, weightPercent: 17.8 }), ctx("AMD", [U3])],
  signals: [sig("AMD", { action: "WATCH", sizeTier: "NONE", amountMinEur: 0, amountMaxEur: 0, unconfirmed: true, carriedFrom: "2026-09-23" }), sig("NVDA")],
  previousIdeas: [], ...over,
});
const words = (symbol, over = {}) => ({
  symbol, verdict: "Fundamentals hold on a dip.", whatHappened: ["Price closed 7.4 percent under its 20-day high.", "EPS beat stated in the release."], whyItMatters: ["Dip qualifier met with a score of 19."],
  numbers: [{ label: "Score", value: "19 of 25" }, { label: "Below high", value: "7.4%" }, { label: "RSI", value: "48.2" }],
  plan: { trigger: "A fresh catalyst would raise the catalyst rating.", invalidation: "A guidance cut.", opportunityCost: "Versus CSPX and cash." },
  evidence: [{ url: U1, label: "Release" }, { url: U2, label: "10-Q" }], unconfirmed: false, ...over,
});
const merge = (ideas, i = input(), n = i.signals) => mergeIdeas({ ideas }, n, buildModelInput(i, n));

test("defaults and flags", () => {
  const o = parseArgs([], {});
  assert.deepEqual([o.model, o.budgetUsd, o.maxSymbols, o.agentMode, o.maxTurns, o.dryRun, o.force], ["sonnet", 0.5, 12, false, 8, false, false]);
  assert.equal(parseArgs([], { JUDGE_MODEL: "opus" }).model, "opus");
  const p = parseArgs(["--dry-run", "--force", "--model", "haiku", "--budget-usd", "0.2", "--as-of", "2026-10-02", "--max-symbols", "5", "--agent-mode", "--max-turns", "4"], {});
  assert.deepEqual([p.dryRun, p.force, p.model, p.budgetUsd, p.asOf, p.maxSymbols, p.agentMode, p.maxTurns], [true, true, "haiku", 0.2, "2026-10-02", 5, true, 4]);
});

test("schema accepts wording, and the model cannot send action, amounts or ratings", () => {
  assert.deepEqual(validateJudgeOutput({ ideas: [words("NVDA")] }), []);
  assert.deepEqual(validateJudgeOutput({ ideas: [] }), []);
  assert.deepEqual(validateJudgeOutput({ ideas: [words("NVDA", { downgrade: { reason: "r", evidenceUrl: U1 }, conflict: { reason: "r", evidenceUrl: U2 } })] }), []);
  const bad = (over) => validateJudgeOutput({ ideas: [words("NVDA", over)] });
  for (const k of ["action", "sizeTier", "amountMinEur", "setup"]) assert.match(bad({ [k]: "ADD" }).join(), /unknown field/, k);
  assert.match(bad({ whatHappened: ["only one"] }).join(), /fewer than 2/);
  assert.match(bad({ numbers: [{ label: "a", value: "b" }] }).join(), /fewer than 3/);
  assert.match(bad({ evidence: [{ url: "http://insecure.example/x", label: "x" }] }).join(), /does not match/);
  assert.match(bad({ downgrade: { reason: "r" } }).join(), /evidenceUrl: required/);
  assert.match(bad({ plan: { trigger: "t", invalidation: "i" } }).join(), /opportunityCost: required/);
  assert.match(validateJudgeOutput({}).join(), /ideas: required/);
});

test("null downgrade and conflict count as absent, other deviations stay errors", () => {
  const out = normalizeOutput({ ideas: [words("NVDA", { downgrade: null, conflict: null })] });
  assert.deepEqual(validateJudgeOutput(out), []);
  assert.ok(!("downgrade" in out.ideas[0]));
  assert.match(validateJudgeOutput(normalizeOutput({ ideas: [words("NVDA", { whyItMatters: ["a", "b", "c"] })] })).join(), /more than 2/);
});

test("only changed signals are news; no routine HOLD", () => {
  const nv = sig("NVDA");
  const prev = [{ symbol: "NVDA", signature: nv.signature }, { symbol: "AMD", signature: "WATCH|A|B|C|NONE" }];
  assert.deepEqual(changedSignals([nv], prev), []);
  assert.deepEqual(changedSignals([sig("NVDA", { amountMaxEur: 95 })], prev), [], "a changed owner band alone is not news");
  assert.equal(changedSignals([sig("NVDA", { action: "HIGH_CONVICTION_ADD", sizeTier: "ADD_HALF" })], prev).length, 1, "a changed tier is news");
  assert.equal(changedSignals([sig("NVDA", { action: "HOLD", sizeTier: "NONE" })], prev).length, 1, "ADD to HOLD is a change");
  assert.equal(changedSignals([sig("MSFT", { action: "HOLD", sizeTier: "NONE" })], prev).length, 0, "a first HOLD is noise");
  assert.equal(changedSignals([sig("MSFT")], prev).length, 1, "a first ADD is news");
});

test("the merge keeps the fixed decision, the tier and the private amount text", () => {
  const { ideas } = merge([words("NVDA"), words("AMD", { evidence: [], unconfirmed: false })]);
  const nvda = ideas.find((i) => i.symbol === "NVDA"), amd = ideas.find((i) => i.symbol === "AMD");
  assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMinEur, nvda.amountMaxEur, nvda.plan.amountNow], ["ADD", "ADD_THIRD", 60, 90, "EUR 60-90"]);
  assert.deepEqual(nvda.setup, { company: "Very strong", entry: "Strong", catalyst: "Good" });
  assert.equal(nvda.signature, "ADD|Very strong|Strong|Good|ADD_THIRD");
  assert.equal(nvda.ruleConfigVersion, "2026-10-06.1");
  assert.equal(amd.sizeTier, "NONE");
  assert.equal(amd.plan.amountNow, "EUR 0");
  assert.equal(amd.carriedFrom, "2026-09-23");
  assert.equal(amd.unconfirmed, true, "the rules mark it unconfirmed and the model cannot clear that");
  assert.equal(amountText("ADD", 60.5, 90), "EUR 60.50-90");
});

test("the model input is data only: no portfolio, no EUR band, no held value, the tier in words", () => {
  const m = buildModelInput(input(), input().signals);
  assert.ok(!("portfolio" in m));
  const text = JSON.stringify(m);
  assert.doesNotMatch(text, /amountMinEur|amountMaxEur|cashEur|valueEur|weightPercent|ownerNotes/);
  const nvda = m.items.find((i) => i.signal.symbol === "NVDA");
  assert.deepEqual([nvda.signal.sizeTier, nvda.signal.size], ["ADD_THIRD", "add about 1/3 of a full position"]);
  assert.ok(!("held" in nvda.context));
  assert.doesNotThrow(() => merge([words("NVDA", { verdict: "Add about 1/3 of a full position on the dip." }), words("AMD", { evidence: [] })]), "the tier fraction is an input figure");
  assert.throws(() => merge([words("NVDA", { verdict: "NVDA is 17.8 percent of the portfolio." }), words("AMD", { evidence: [] })]), /figures not in the input: 17.8/, "the owner's weight is not in the model input");
});

test("evidence urls outside the input, invented figures and wrong symbols fail the call", () => {
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: "https://example.com/made-up", label: "x" }, { url: U1, label: "ok" }] }), words("AMD", { evidence: [] })]), /evidence url not in the input/);
  assert.throws(() => merge([words("NVDA", { verdict: "Cash left would be EUR 510." }), words("AMD", { evidence: [] })]), /figures not in the input: 510/);
  assert.throws(() => merge([words("NVDA", { whyItMatters: ["Revenue grew 37.5 percent."] }), words("AMD", { evidence: [] })]), /figures not in the input/);
  assert.throws(() => merge([words("NVDA"), words("AMD", { evidence: [] }), words("ZZZ")]), /not an item/);
  assert.throws(() => merge([words("NVDA")]), /no idea for AMD/);
  assert.throws(() => merge([words("NVDA"), words("NVDA"), words("AMD", { evidence: [] })]), /second idea/);
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: U1, label: "one" }] }), words("AMD", { evidence: [] })]), /fewer than two evidence links/);
});

test("figures: input numbers and common rule windows pass, others are rejected", () => {
  const inp = { score: 19, below: 7.4, text: "price 1,200.50" };
  assert.deepEqual(inventedFigures(["score 19, 7.40 percent under the 20-day high, RSI 14, 1200.5"], inp), []);
  assert.deepEqual(inventedFigures(["target 150 and 33.1"], inp), [150, 33.1]);
});

test("figures: digits in urls, dates, ids and accession numbers are not allowed figures", () => {
  const inp = { evidence: [{ url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/nvda-8k.htm", publishedAt: "2026-10-01", accession: "0001045810-26-000123", id: 777 .toString() }], close: 120.5 };
  assert.deepEqual(inventedFigures(["close 120.5"], inp), []);
  assert.deepEqual(inventedFigures(["filing 1045810 and 123 and 777"], inp), [1045810, 123, 777]);
  assert.deepEqual(inventedFigures(["see 2026-10-01"], inp), []);
  assert.deepEqual(inventedFigures(["see 2026-10-02"], inp), [2026, 10, 2]);
});

test("figures: the sign matters, ranges and windows are not signs", () => {
  const inp = { change: -5.2, up: 3.1, range: "EUR 60-90" };
  assert.deepEqual(inventedFigures(["fell -5.2 percent", "rose 3.1"], inp), []);
  assert.deepEqual(inventedFigures(["rose 5.2 percent"], inp), [5.2]);
  assert.deepEqual(inventedFigures(["fell -3.1 percent"], inp), [-3.1]);
  assert.deepEqual(inventedFigures(["EUR 60-90 and the 20-day high"], inp), []);
});

test("each idea can cite only its own figures and URLs", () => {
  assert.throws(() => merge([words("NVDA", { whatHappened: ["AMD held EUR 0.", "The price was 999."] }), words("AMD", { evidence: [] })]), /figures not in the input/);
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: U1, label: "own" }, { url: U3, label: "other symbol" }] }), words("AMD", { evidence: [] })]), /evidence url not in the input/);
  assert.deepEqual(inventedFigures(["generic 25, 50 and 100 percent"], { score: 19 }), [25, 50, 100]);
});

test("a figure that belongs to another item's context is rejected for this item", () => {
  const amd = ctx("AMD", [U3]);
  amd.technicals = { ...amd.technicals, close: 77.7, rsi14: 31.9 };
  const i = input({ symbols: [ctx("NVDA", [U1, U2]), amd] });
  const own = (symbol, text, over = {}) => words(symbol, { whatHappened: [text, "EPS beat stated in the release."], ...over });
  assert.throws(() => merge([own("NVDA", "Price closed at 77.7."), words("AMD", { evidence: [] })], i), /NVDA: figures not in the input: 77.7/);
  assert.throws(() => merge([words("NVDA"), own("AMD", "RSI was 48.2 and 7.4 percent under the high.", { evidence: [] })], i), /AMD: figures not in the input/);
  assert.doesNotThrow(() => merge([words("NVDA"), own("AMD", "Price closed at 77.7, RSI 31.9.", { evidence: [], numbers: [{ label: "Score", value: "19 of 25" }, { label: "Close", value: "77.7" }, { label: "RSI", value: "31.9" }] })], i));
});

test("a downgrade only moves a buy to WATCH EUR 0 and keeps the signature; a conflict adds a note", () => {
  const down = { reason: "The cited 8-K reports a guidance cut.", evidenceUrl: U1 };
  const { ideas } = merge([words("NVDA", { downgrade: down, conflict: { reason: "Rules and the 10-Q disagree.", evidenceUrl: U2 } }), words("AMD", { evidence: [] })]);
  const nvda = ideas.find((i) => i.symbol === "NVDA");
  assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMinEur, nvda.amountMaxEur, nvda.plan.amountNow, nvda.downgradedFrom], ["WATCH", "NONE", 0, 0, "EUR 0", "ADD"]);
  assert.equal(nvda.signature, "ADD|Very strong|Strong|Good|ADD_THIRD", "the signature stays the deterministic one, so tomorrow it is not new again");
  assert.equal(nvda.conflictNote, "Rules and the 10-Q disagree.");
  assert.equal(nvda.unconfirmed, true);
  assert.throws(() => merge([words("NVDA", { downgrade: { reason: "r", evidenceUrl: "https://example.com/other" } }), words("AMD", { evidence: [] })]), /cites a url not in the input/);
  const i2 = input({ signals: [sig("NVDA", { action: "REDUCE", sizeTier: "NONE", amountMinEur: 100, amountMaxEur: 200 })] });
  const r = merge([words("NVDA", { downgrade: down })], i2);
  assert.equal(r.ideas[0].action, "REDUCE", "a downgrade cannot remove a REDUCE");
  assert.match(r.notes[0], /downgrade ignored/);
});

test("hash ignores generatedAt and previousIdeas and follows rule version, inputs, prompt, model and mode", () => {
  const base = { input: input(), prompt: "p", model: "sonnet" };
  const h = judgeHash(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(judgeHash({ ...base, input: input({ generatedAt: "later", previousIdeas: [{ symbol: "X" }] }) }), h);
  assert.notEqual(judgeHash({ ...base, input: input({ ruleConfigVersion: "2026-10-07.1" }) }), h);
  assert.notEqual(judgeHash({ ...base, input: input({ portfolio: { ...input().portfolio, cashEur: 601 } }) }), h);
  assert.notEqual(judgeHash({ ...base, prompt: "q" }), h);
  assert.notEqual(judgeHash({ ...base, model: "opus" }), h);
  assert.notEqual(judgeHash({ ...base, agentMode: true }), h);
});

test("agent mode allows read-only file tools only", () => {
  const args = agentModeArgs({ model: "sonnet" }, 0.4);
  assert.equal(args[args.indexOf("--tools") + 1], "Read,Grep,Glob");
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Read,Grep,Glob");
  assert.match(args[args.indexOf("--disallowedTools") + 1], /Bash.*Edit.*Write.*WebFetch.*WebSearch/);
  assert.equal(args[args.indexOf("--max-budget-usd") + 1], "0.4");
  assert.ok(args.includes("--no-session-persistence"));
  const env = (o) => JSON.stringify({ is_error: false, result: "{}", num_turns: 3, total_cost_usd: 0.1, usage: {}, modelUsage: { m: {} }, permission_denials: [], ...o });
  assert.equal(parseAgentEnvelope(env(), "sonnet", 8).usage.turns, 3);
  assert.throws(() => parseAgentEnvelope(env({ num_turns: 9 }), "sonnet", 8), /the cap is 8/);
  assert.throws(() => parseAgentEnvelope(env({ permission_denials: [{ tool_name: "Bash" }] }), "sonnet", 8), /not allowed/);
});

// ---------- stubbed model process ----------
const envelope = (text, over = {}) => JSON.stringify({ type: "result", is_error: false, result: text, num_turns: 1, total_cost_usd: 0.0123, usage: { input_tokens: 11, output_tokens: 22, cache_read_input_tokens: 33, cache_creation_input_tokens: 44 }, modelUsage: { "claude-sonnet-stub": {} }, permission_denials: [], ...over });
function stub() {
  const dir = mkdtempSync(join(tmpdir(), "judge-stub-"));
  writeFileSync(join(dir, "response.txt"), "");
  writeFileSync(join(dir, "claude"), `#!/usr/bin/env node
const fs = require("fs"); const d = ${JSON.stringify(dir)};
let stdin = ""; process.stdin.on("data", (c) => { stdin += c; });
process.stdin.on("end", () => {
  fs.appendFileSync(d + "/calls.jsonl", JSON.stringify({ args: process.argv.slice(2), stdinLength: stdin.length, hasInput: stdin.includes("Input:"), cwdFiles: fs.readdirSync(process.cwd()) }) + "\\n");
  const queue = d + "/queue.json";
  let out = fs.readFileSync(d + "/response.txt", "utf8");
  if (fs.existsSync(queue)) { const q = JSON.parse(fs.readFileSync(queue, "utf8")); if (q.length) { out = q.shift(); fs.writeFileSync(queue, JSON.stringify(q)); } }
  process.stdout.write(out);
});
`);
  chmodSync(join(dir, "claude"), 0o755);
  return { dir, respond: (text) => writeFileSync(join(dir, "response.txt"), text), queue: (list) => writeFileSync(join(dir, "queue.json"), JSON.stringify(list)), calls: () => (existsSync(join(dir, "calls.jsonl")) ? readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []) };
}
const flag = (args, name) => args[args.indexOf(name) + 1];

test("the single call has no tools, a dollar cap and the requested model", async () => {
  const s = stub(); s.respond(envelope("{}"));
  const old = process.env.PATH; process.env.PATH = `${s.dir}:${old}`;
  try { await callAgentNoTools({ agent: "claude", model: "sonnet", timeoutS: 30, budgetUsd: 0.25 }, "prompt text", s.dir); } finally { process.env.PATH = old; }
  const { args } = s.calls()[0];
  assert.equal(flag(args, "--tools"), "", "--tools is followed by an empty string");
  assert.equal(flag(args, "--max-budget-usd"), "0.25");
  assert.equal(flag(args, "--model"), "sonnet");
  assert.ok(!args.some((a) => /WebSearch|WebFetch|allowedTools|Read|Bash/i.test(a)), "no tool is named");
});

function mockWeb({ skipDay = false, skipHash = false, inputOverride = null } = {}) {
  const seen = { posts: [], gets: [], auth: [] };
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => { body += c; });
    req.on("end", () => {
      seen.auth.push(req.headers.authorization);
      const send = (o, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.method === "POST" && req.url === "/api/ingest/ideas") { seen.posts.push(JSON.parse(body)); return send({ recorded: true, stored: 1 }); }
      if (req.url.startsWith("/api/ingest/judge-input")) { seen.gets.push(req.url); return send(inputOverride ?? input()); }
      if (req.url.startsWith("/api/ingest/ideas?")) { seen.gets.push(req.url); return send({ skip: req.url.includes("inputHash") ? skipHash : skipDay }); }
      send({ error: "not found" }, 404);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ seen, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}
function runJudge(args, { s, env = {} }) {
  const out = mkdtempSync(join(tmpdir(), "judge-out-"));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, PATH: `${s.dir}:${process.env.PATH}`, INGEST_TOKEN: "test-token", SCAN_OUT_DIR: out, ...env } });
    let err = ""; child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, err, out }));
  });
}
const both = [words("NVDA"), words("AMD", { evidence: [] })];

test("end to end: one call for the changed signals, fixed decisions kept, tokens recorded, skips honoured", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA")], notes: "n" })));
  const prev = [{ symbol: "AMD", signature: "WATCH|Very strong|Strong|Good|NONE" }];
  let web = await mockWeb({ inputOverride: input({ previousIdeas: prev }) });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--budget-usd", "0.3", "--max-symbols", "7"], { s });
    assert.equal(r.code, 0, r.err);
    assert.equal(s.calls().length, 1, "exactly one model call");
    assert.equal(flag(s.calls()[0].args, "--max-budget-usd"), "0.3");
    assert.equal(flag(s.calls()[0].args, "--tools"), "");
    assert.ok(web.seen.gets.some((g) => g.includes("maxSymbols=7")));
    const post = web.seen.posts[0];
    assert.deepEqual(post.ideas.map((i) => i.symbol), ["NVDA"], "AMD signal unchanged, so no alert and no model text asked for it");
    assert.equal(post.ideas[0].action, "ADD");
    assert.equal(post.ideas[0].signature, "ADD|Very strong|Strong|Good|ADD_THIRD");
    assert.equal(post.ideas[0].sizeTier, "ADD_THIRD");
    assert.equal(post.run.status, "ok");
    assert.equal(post.run.ruleConfigVersion, "2026-10-06.1");
    assert.deepEqual(post.run.usage, { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheCreationTokens: 44, turns: 1 });
    assert.equal(post.run.costUsd, 0.0123);
    assert.ok(web.seen.auth.every((a) => a === "Bearer test-token"));
    assert.match(r.err, /1 model call\(s\).*tokens in 11 out 22 cache read 33 cache created 44, turns 1, cost \$0\.0123/);
  } finally { await web.close(); }
});

test("only the changed symbols reach the model, and an empty change list makes no call", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA")] })));
  const prev = [{ symbol: "AMD", signature: "WATCH|Very strong|Strong|Good|NONE" }];
  let web = await mockWeb({ inputOverride: input({ previousIdeas: prev }) });
  try {
    await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.ok(s.calls()[0].hasInput);
  } finally { await web.close(); }
  const s2 = stub();
  web = await mockWeb({ inputOverride: input({ previousIdeas: [{ symbol: "AMD", signature: "WATCH|Very strong|Strong|Good|NONE" }, { symbol: "NVDA", signature: "ADD|Very strong|Strong|Good|ADD_THIRD" }] }) });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s: s2 });
    assert.equal(r.code, 0);
    assert.equal(s2.calls().length, 0);
    assert.match(r.err, /no model call/);
    assert.equal(web.seen.posts.length, 0);
  } finally { await web.close(); }
});

test("no portfolio baseline: the run goes on, the data-only signal is posted with owner amounts 0", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both })));
  const bare = input({ portfolio: null, signals: input().signals.map((x) => ({ ...x, amountMinEur: 0, amountMaxEur: 0 })) });
  const web = await mockWeb({ inputOverride: bare });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /no portfolio baseline: signals come from data alone/);
    const nvda = web.seen.posts[0].ideas.find((i) => i.symbol === "NVDA");
    assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMinEur, nvda.amountMaxEur, nvda.plan.amountNow], ["ADD", "ADD_THIRD", 0, 0, "EUR 0"]);
  } finally { await web.close(); }
});

test("one run per day and an unchanged input skip the call; --force reruns", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both })));
  let web = await mockWeb({ skipDay: true });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /one run per day/);
    assert.equal(s.calls().length, 0);
    const forced = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--force"], { s });
    assert.equal(forced.code, 0, forced.err);
    assert.equal(s.calls().length, 1);
  } finally { await web.close(); }
  web = await mockWeb({ skipHash: true });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.match(r.err, /same input already judged/);
    assert.equal(s.calls().length, 1, "no new call");
    assert.equal(web.seen.posts.length, 0);
  } finally { await web.close(); }
});

test("a downgrade from the model is applied by the script, never an upgrade", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA", { downgrade: { reason: "Guidance cut in the cited release.", evidenceUrl: U1 } }), words("AMD", { evidence: [] })] })));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    const nvda = web.seen.posts[0].ideas.find((i) => i.symbol === "NVDA");
    assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMaxEur, nvda.downgradedFrom], ["WATCH", "NONE", 0, "ADD"]);
  } finally { await web.close(); }
});

test("invalid wording is retried once, then a failed run is recorded and the exit is 1", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA", { verdict: "Cash left EUR 510." }), words("AMD", { evidence: [] })] })));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 1);
    assert.equal(s.calls().length, 2);
    assert.equal(web.seen.posts[0].run.status, "failed");
    assert.deepEqual(web.seen.posts[0].ideas, []);
    assert.match(web.seen.posts[0].run.error, /figures not in the input/);
  } finally { await web.close(); }
});

test("the cost cap shrinks the retry budget and stops a second call once spent", async () => {
  const bad = (cost) => envelope(JSON.stringify({ ideas: [words("NVDA", { verdict: "Cash left EUR 510." })] }), { total_cost_usd: cost });
  let s = stub(); s.queue([bad(0.45), bad(0.01)]);
  let web = await mockWeb();
  try {
    await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--budget-usd", "0.5"], { s });
    assert.equal(s.calls().length, 2);
    assert.equal(flag(s.calls()[0].args, "--max-budget-usd"), "0.5");
    assert.equal(flag(s.calls()[1].args, "--max-budget-usd"), "0.05", "the second call only gets what is left");
  } finally { await web.close(); }
  s = stub(); s.queue([bad(0.6), bad(0.01)]);
  web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--budget-usd", "0.5"], { s });
    assert.equal(r.code, 1);
    assert.equal(s.calls().length, 1, "the cap stopped the second call");
    assert.match(r.err, /cost cap reached/);
    assert.match(web.seen.posts[0].run.error, /cost cap/);
  } finally { await web.close(); }
});

test("a rate limit is not retried", async () => {
  const s = stub(); s.respond(envelope("rate limit reached", { is_error: true }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 1);
    assert.equal(s.calls().length, 1);
    assert.match(r.err, /rate limit; stopping/);
  } finally { await web.close(); }
});

test("a second turn is rejected as tool use in the default mode", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both }), { num_turns: 2 }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 1);
    assert.match(r.err, /tool use is not allowed/);
  } finally { await web.close(); }
});

test("agent mode: read-only tools, prepared files in the working directory, turn cap", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both }), { num_turns: 4 }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--agent-mode", "--max-turns", "6"], { s });
    assert.equal(r.code, 0, r.err);
    const call = s.calls()[0];
    assert.equal(flag(call.args, "--tools"), "Read,Grep,Glob");
    assert.match(flag(call.args, "--disallowedTools"), /Bash/);
    assert.deepEqual(call.cwdFiles.sort(), ["facts.json", "ideas-history.json", "signals.json", "technicals.json"]);
    assert.equal(web.seen.posts[0].run.usage.turns, 4);
    assert.match(r.err, /agent\(max 6 turns\)/);
  } finally { await web.close(); }
  const s2 = stub(); s2.respond(envelope(JSON.stringify({ ideas: both }), { num_turns: 9 }));
  const web2 = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web2.base, "--agent-mode", "--max-turns", "6"], { s: s2 });
    assert.equal(r.code, 1);
    assert.match(r.err, /the cap is 6/);
  } finally { await web2.close(); }
});

test("dry run with an input file needs no token, posts nothing and writes the payload", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both })));
  const file = join(mkdtempSync(join(tmpdir(), "judge-in-")), "input.json"); writeFileSync(file, JSON.stringify(input()));
  const r = await runJudge(["--as-of", "2026-10-05", "--dry-run", "--input-file", file], { s, env: { INGEST_TOKEN: "", HOME: "/nonexistent" } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /dry run: nothing posted/);
  const name = readdirSync(r.out).find((n) => /^judge-payload-/.test(n));
  const payload = JSON.parse(readFileSync(join(r.out, name), "utf8"));
  assert.equal(payload.ideas.length, 2);
  assert.equal(payload.run.status, "ok");
});
