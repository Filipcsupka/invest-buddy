import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexResearchAdapter, deriveStrictSchema, parseCodexEvents, researchAdapter, resetCodexRateLimit } from "../research-adapters.mjs";
import { bratislavaClock, checkResearchCaps } from "../research-caps.mjs";
import { validateResearchOutput } from "../research-validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const schemaPath = join(root, "scanner/schema/research-output.schema.json");
const sample = JSON.parse(readFileSync(join(root, "src/research/fixtures/sample-output.json"), "utf8"));

const collect = (node, visit, path = "$") => {
  if (Array.isArray(node)) return node.forEach((v, i) => collect(v, visit, `${path}[${i}]`));
  if (!node || typeof node !== "object") return;
  visit(node, path);
  for (const [k, v] of Object.entries(node)) collect(v, visit, `${path}.${k}`);
};

test("strict schema: no refs, closed objects, all properties required, no unsupported keywords", () => {
  const strict = deriveStrictSchema(JSON.parse(readFileSync(schemaPath, "utf8")));
  assert.equal(JSON.stringify(strict).includes("$ref"), false);
  const banned = ["$defs", "$schema", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "minItems", "maxItems", "const", "default"];
  let objects = 0;
  collect(strict, (node, path) => {
    for (const key of banned) assert.equal(key in node, false, `${path} has ${key}`);
    if (node.properties) {
      objects += 1;
      assert.equal(node.additionalProperties, false, path);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), path);
    }
  });
  assert.ok(objects > 8);
  assert.deepEqual(strict.required, ["findings", "candidates", "chains", "notes"]);
  assert.deepEqual(strict.properties.notes.type, ["string", "null"]);
});

test("strict schema: const becomes enum, refs merge siblings, bad input throws", () => {
  const schema = { $defs: { a: { type: "string", const: "x", pattern: "^x$" }, modelOutput: { type: "object", properties: { v: { $ref: "#/$defs/a", description: "d" } } } } };
  assert.deepEqual(deriveStrictSchema(schema), { type: "object", properties: { v: { type: "string", enum: ["x"], description: "d" } }, required: ["v"], additionalProperties: false });
  assert.throws(() => deriveStrictSchema({ $defs: { modelOutput: { type: "object", properties: { v: { $ref: "#/$defs/nope" } } } } }), /unresolvable/);
  assert.throws(() => deriveStrictSchema({ $defs: { modelOutput: { type: "object", properties: { v: { $ref: "#/$defs/modelOutput" } } } } }), /recursive/);
  assert.throws(() => deriveStrictSchema({}), /modelOutput/);
});

test("the existing validator still runs on a reply that matches the strict shape", () => {
  const payload = structuredClone(sample);
  assert.deepEqual(validateResearchOutput(payload), []);
  payload.output.findings[0].evidence[0].quote = "short";
  assert.ok(validateResearchOutput(payload).length > 0);
});

test("event parser maps usage, counts searches and reads a rate limit when present", () => {
  const lines = [{ type: "thread.started" }, { type: "item.completed", item: { type: "web_search" } }, { type: "item.completed", item: { type: "agent_message" } },
    { type: "turn.completed", usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 50 }, rate_limits: { primary: { used_percent: 12 }, secondary: { used_percent: 61.5 } } }].map((e) => JSON.stringify(e)).join("\n");
  const parsed = parseCodexEvents(`${lines}\nnot json\n`);
  assert.deepEqual(parsed.usage, { inputTokens: 600, outputTokens: 50, cacheReadTokens: 400, cacheCreationTokens: null, turns: null });
  assert.equal(parsed.webSearches, 1);
  assert.equal(parsed.rateLimitPct, 61.5);
  const bare = parseCodexEvents(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 5, output_tokens: 1 } }));
  assert.equal(bare.rateLimitPct, null);
  assert.equal(parseCodexEvents("").usage.inputTokens, null);
  assert.equal(parseCodexEvents(JSON.stringify({ type: "turn.failed", error: { message: "boom" } })).failure, "boom");
});

const withFake = async (events, fn, { reply = JSON.stringify(sample.output), exit = 0, writeReply = true } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "codex-fake-"));
  const bin = join(dir, "codex");
  writeFileSync(join(dir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n"));
  writeFileSync(join(dir, "reply.txt"), reply);
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require('fs');const d=__dirname;const a=process.argv.slice(2);
const val=(f)=>a[a.indexOf(f)+1];
let stdin='';process.stdin.on('data',(c)=>{stdin+=c});process.stdin.on('end',()=>{
  fs.writeFileSync(d+'/capture.json',JSON.stringify({args:a,env:Object.keys(process.env).sort(),cwd:process.cwd(),stdin,schema:JSON.parse(fs.readFileSync(val('--output-schema'),'utf8')),cDirEntries:fs.readdirSync(val('-C'))}));
  ${writeReply ? "fs.writeFileSync(val('-o'),fs.readFileSync(d+'/reply.txt','utf8'));" : ""}
  process.stdout.write(fs.readFileSync(d+'/events.jsonl','utf8')+'\\n');process.exitCode=${exit};
});
`);
  chmodSync(bin, 0o755);
  const saved = { ...process.env };
  Object.assign(process.env, { PATH: `${dir}:${saved.PATH}`, FAKE_DIR: dir, UNRELATED_SECRET: "must-not-pass", INGEST_TOKEN: "t", ANTHROPIC_API_KEY: "a", CLAUDE_CODE_OAUTH_TOKEN: "o", OPENAI_API_KEY: "k", CODEX_HOME: dir, CODEX_ACCESS_TOKEN: "" });
  try { return await fn(dir, () => JSON.parse(readFileSync(join(dir, "capture.json"), "utf8"))); }
  finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
};

const turn = { type: "turn.completed", usage: { input_tokens: 200, cached_input_tokens: 50, output_tokens: 30 } };

test("codex adapter: exact flags and order, strict schema file, -o reply, usage, empty work dir", async () => {
  resetCodexRateLimit();
  const work = mkdtempSync(join(tmpdir(), "invest-research-"));
  await withFake([{ type: "item.completed", item: { type: "web_search" } }, turn], async (dir, capture) => {
    const result = await codexResearchAdapter.run({ prompt: "PROMPT", schemaPath, timeoutMs: 20000, workDir: work });
    const c = capture();
    const head = ["--search", "-a", "never", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--output-schema"];
    assert.deepEqual(c.args.slice(0, 11), head);
    assert.match(c.args[11], /output-schema\.json$/);
    assert.deepEqual(c.args.slice(12, 14), ["-C", work]);
    assert.equal(c.args[14], "-o");
    assert.match(c.args[15], /reply\.json$/);
    assert.deepEqual(c.args.slice(16), ["--json", "-"]);
    assert.equal(c.stdin, "PROMPT");
    assert.equal(c.cwd.replace(/^\/private/, ""), work.replace(/^\/private/, ""));
    assert.deepEqual(c.cDirEntries, []);
    assert.equal(JSON.stringify(c.schema).includes("$ref"), false);
    assert.deepEqual(c.schema.required, ["findings", "candidates", "chains", "notes"]);
    assert.deepEqual(JSON.parse(result.text), sample.output);
    assert.deepEqual(result.usage, { inputTokens: 150, outputTokens: 30, cacheReadTokens: 50, cacheCreationTokens: null, turns: null });
    assert.equal(result.webSearches, 1);
    assert.equal(result.costUsd, 0);
    assert.equal(result.rateLimitPct, null);
    assert.equal(existsSync(c.args[11]), false, "schema file is removed");
    assert.equal((await codexResearchAdapter.quota()), null);
  });
});

test("codex adapter: env allow-list passes only Codex and OpenAI names beyond the shared base", async () => {
  const work = mkdtempSync(join(tmpdir(), "invest-research-"));
  await withFake([turn], async (dir, capture) => {
    await codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work });
    const keys = capture().env;
    for (const secret of ["UNRELATED_SECRET", "INGEST_TOKEN", "FAKE_DIR"]) assert.equal(keys.includes(secret), false, secret);
    assert.ok(keys.includes("OPENAI_API_KEY") && keys.includes("CODEX_HOME"));
    const allow = new Set(["PATH", "HOME", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "USER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CODEX_API_KEY", "LANG", "LANGUAGE", "LC_ALL", "TZ", "TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]);
    assert.deepEqual(keys.filter((k) => !allow.has(k) && k !== "__CF_USER_TEXT_ENCODING" && !/^LC_[A-Z_]+$/.test(k)), []);
  });
});

test("codex adapter: rate limit from events is remembered; failures carry usage; missing reply is an error", async () => {
  resetCodexRateLimit();
  const work = mkdtempSync(join(tmpdir(), "invest-research-"));
  await withFake([{ ...turn, rate_limits: { primary: { used_percent: 55 } } }], async () => {
    const result = await codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work });
    assert.equal(result.rateLimitPct, 55);
    assert.deepEqual(await codexResearchAdapter.quota(), { window: "codex", pct: 55, resetAt: null });
  });
  resetCodexRateLimit();
  await withFake([turn], async () => {
    await assert.rejects(codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work }), (e) => /no reply file/.test(e.message) && e.usage.inputTokens === 150);
  }, { writeReply: false });
  await withFake([turn], async () => {
    await assert.rejects(codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work }), (e) => /exited 1/.test(e.message) && e.usage.outputTokens === 30);
  }, { exit: 1 });
  await withFake([{ type: "turn.failed", error: { message: "denied" } }], async () => {
    await assert.rejects(codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work }), /codex error: denied/);
  });
});

test("codex auth check: a local login must pass codex login status", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  const bin = join(home, "codex");
  writeFileSync(bin, `#!/usr/bin/env node\nconst fs=require('fs');const p=process.env.CODEX_HOME+'/auth.json';if(process.argv.slice(2).join(' ')!=='login status')process.exit(2);try{const a=JSON.parse(fs.readFileSync(p,'utf8'));process.exit(a.tokens?.access_token||a.personal_access_token?0:1)}catch{process.exit(1)}\n`);
  chmodSync(bin, 0o755);
  const env = { HOME: "/nonexistent", CODEX_HOME: home, PATH: `${home}:${process.env.PATH}` };
  assert.equal(codexResearchAdapter.available({ HOME: home }).ok, false);
  assert.match(codexResearchAdapter.available({ HOME: home }).reason, /auth.json/);
  assert.equal(codexResearchAdapter.available({ HOME: home, ANTHROPIC_API_KEY: "x", CLAUDE_CODE_OAUTH_TOKEN: "x" }).ok, false);
  assert.match(codexResearchAdapter.available({ HOME: home, OPENAI_API_KEY: "k" }).reason, /RESEARCH_MONTHLY_USD/);
  writeFileSync(join(home, "auth.json"), "{}");
  assert.match(codexResearchAdapter.available(env).reason, /codex login status/);
  writeFileSync(join(home, "auth.json"), JSON.stringify({ tokens: { access_token: "stub" } }));
  assert.equal(codexResearchAdapter.available(env).ok, true);
  assert.equal(codexResearchAdapter.authSource({ OPENAI_API_KEY: "k" }), "api");
  assert.equal(codexResearchAdapter.authSource({}), "codex");
  assert.equal(researchAdapter("codex"), codexResearchAdapter);
});

const now = new Date("2026-10-11T01:00:00Z");
const usage = { day: "2026-10-11", month: "2026-10", monthlyTokens: 10, monthlyUsd: 1, dailyCalls: 0, codexDailyCalls: 0, dailyTokens: 10, sharedDailyTokens: 10 };
const gate = (env, override = {}) => checkResearchCaps({ env: { RESEARCH_ENABLED: "on", ...env }, now, type: "daily", adapter: "codex", authSource: "codex", usage, liveUsage: async () => { throw new Error("Claude quota must not be read"); }, ...override });

test("codex caps: 2 calls a day, window, 50 percent, unknown quota, unmetered API spend", async () => {
  assert.equal((await gate({}, { codexQuota: async () => ({ pct: 49 }) })).ok, true);
  assert.equal((await gate({}, { codexQuota: async () => ({ pct: 50 }) })).status, "skipped_quota");
  assert.equal((await gate({}, { codexQuota: async () => null })).status, "skipped_quota");
  assert.equal((await gate({}, {})).status, "skipped_quota");
  assert.equal((await gate({ RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" }, { codexQuota: async () => null })).ok, true);
  assert.equal((await gate({ RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" }, { codexQuota: async () => ({ pct: 80 }) })).status, "skipped_quota");
  assert.equal((await gate({}, { usage: { ...usage, codexDailyCalls: 2 }, codexQuota: async () => ({ pct: 1 }) })).status, "skipped_cap");
  assert.equal((await gate({}, { usage: { ...usage, codexDailyCalls: 1 }, codexQuota: async () => ({ pct: 1 }) })).ok, true);
  assert.equal((await gate({}, { usage: { ...usage, codexDailyCalls: undefined }, codexQuota: async () => ({ pct: 1 }) })).status, "skipped_cap");
  assert.equal((await gate({ RESEARCH_WINDOW: "04:00-07:00" }, { codexQuota: async () => ({ pct: 1 }) })).status, "skipped_window");
  const outside = new Date("2026-10-11T11:00:00Z");
  assert.equal((await gate({}, { now: outside, type: "deepdive", manual: true, codexQuota: async () => ({ pct: 1 }) })).status, "skipped_window");
  // No Codex price source exists in the repo, so a positive USD setting cannot cap API spend.
  assert.equal((await gate({ RESEARCH_MONTHLY_USD: "100" }, { authSource: "api" })).status, "skipped_cap");
  assert.equal((await gate({ RESEARCH_MONTHLY_USD: "1" }, { authSource: "api" })).status, "skipped_cap");
  assert.equal((await gate({}, { authSource: "api" })).status, "skipped_cap");
});

async function runRunner({ adapterEnv = {}, codexDailyCalls = 0, rateLimitPct = null, execFailureEchoToken = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "research-codex-run-"));
  const home = join(dir, "home"); mkdirSync(home);
  const bin = join(dir, "codex");
  const input = join(dir, "input.json");
  writeFileSync(input, JSON.stringify({ symbols: ["SMPL"], triggers: [], knownFacts: [], openCandidates: [] }));
  writeFileSync(join(dir, "reply.json"), JSON.stringify(sample.output));
  writeFileSync(join(dir, "events.jsonl"), JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 20 }, ...(rateLimitPct === null ? {} : { rate_limits: { primary: { used_percent: rateLimitPct } } }) }));
  if (execFailureEchoToken) writeFileSync(join(dir, "echo-token"), "1");
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);const d=__dirname;
if(a.join(' ')==='login status'){
  try{const x=JSON.parse(fs.readFileSync(process.env.CODEX_HOME+'/auth.json','utf8'));process.exit(x.tokens?.access_token||x.personal_access_token==='test-workspace-token'?0:1)}catch{process.exit(1)}
}
if(a.includes('--with-access-token')){
  let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
    fs.appendFileSync(d+'/auth-events.log',JSON.stringify({home:process.env.CODEX_HOME,mode:fs.statSync(process.env.CODEX_HOME).mode&0o777,args:a,stdinMatches:input==='test-workspace-token',envHasToken:Object.values(process.env).includes(input)})+'\\n');
    if(input!=='test-workspace-token')process.exit(1);
    fs.writeFileSync(process.env.CODEX_HOME+'/auth.json',JSON.stringify({personal_access_token:input}));
  });
}else{
  fs.appendFileSync(d+'/calls.log',a.join(' ')+'\\n');
  fs.appendFileSync(d+'/exec-events.log',JSON.stringify({home:process.env.CODEX_HOME,args:a,envKeys:Object.keys(process.env),envHasToken:Object.values(process.env).includes('test-workspace-token')})+'\\n');
  process.stdin.resume();process.stdin.on('end',()=>{
    if(fs.existsSync(d+'/echo-token')){const x=JSON.parse(fs.readFileSync(process.env.CODEX_HOME+'/auth.json','utf8'));process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:x.personal_access_token}}));return}
    fs.writeFileSync(a[a.indexOf('-o')+1],fs.readFileSync(d+'/reply.json','utf8'));process.stdout.write(fs.readFileSync(d+'/events.jsonl','utf8'))
  });
}
`);
  chmodSync(bin, 0o755);
  const posts = [], budgets = [];
  const server = createServer((req, res) => {
    if (req.method === "POST") { let body = ""; req.on("data", (d) => { body += d; }); req.on("end", () => { (req.url === "/api/ingest/research" ? posts : budgets).push(JSON.parse(body)); res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); }); }
    else if (req.url === "/api/ingest/ai-budget?report=research-caps") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ day: bratislavaClock().day, month: bratislavaClock().day.slice(0, 7), monthlyTokens: 0, monthlyUsd: 0, dailyCalls: 0, codexDailyCalls, dailyTokens: 0, sharedDailyTokens: 0 })); }
    else { res.writeHead(500); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, HOME: home, FAKE_DIR: dir, RESEARCH_OUT_DIR: join(dir, "out"), RESEARCH_ADAPTER: "codex", RESEARCH_ENABLED: "on", RESEARCH_WINDOW: "00:00-23:59", INGEST_TOKEN: "test-token", RESEARCH_MONTHLY_USD: "100", ...adapterEnv };
  delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; delete env.CODEX_HOME; delete env.CODEX_ACCESS_TOKEN; Object.assign(env, adapterEnv);
  const args = [join(root, "scanner/run-research.mjs"), "--type", "daily", "--as-of", "2026-10-11", "--input-file", input, "--base-url", baseUrl];
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; }); child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  server.close();
  const calls = existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n") : [];
  const authEvents = existsSync(join(dir, "auth-events.log")) ? readFileSync(join(dir, "auth-events.log"), "utf8").trim().split("\n").map(JSON.parse) : [];
  const execEvents = existsSync(join(dir, "exec-events.log")) ? readFileSync(join(dir, "exec-events.log"), "utf8").trim().split("\n").map(JSON.parse) : [];
  const logs = ["calls.log", "auth-events.log", "exec-events.log"].filter((name) => existsSync(join(dir, name))).map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  return { ...result, posts, budgets, calls, authEvents, execEvents, logs, home };
}

test("RESEARCH_ADAPTER=codex without usable auth fails at start with no model call and no network", async () => {
  const r = await runRunner();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /RESEARCH_ADAPTER=codex: Codex auth is unavailable: provide/);
  assert.deepEqual(r.calls, []);
  assert.equal(r.posts.length + r.budgets.length, 0);
});

test("codex API key is rejected before a model call because the USD cap cannot be enforced", async () => {
  const r = await runRunner({ adapterEnv: { OPENAI_API_KEY: "k" } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /RESEARCH_ADAPTER=codex: Codex API spend is unmetered/);
  assert.deepEqual(r.calls, []);
  assert.equal(r.posts.length + r.budgets.length, 0);
});

test("codex login rejected by CLI fails at start with no model call or network", async () => {
  const home = mkdtempSync(join(tmpdir(), "codex-login-"));
  writeFileSync(join(home, "auth.json"), "{}");
  const r = await runRunner({ adapterEnv: { CODEX_HOME: home } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /RESEARCH_ADAPTER=codex: Codex auth is unavailable: codex login status/);
  assert.deepEqual(r.calls, []);
  assert.equal(r.posts.length + r.budgets.length, 0);
});

test("workspace token is passed on stdin, checked at start and removed with its private home", async () => {
  const token = "test-workspace-token";
  const skipped = await runRunner({ adapterEnv: { CODEX_ACCESS_TOKEN: token } });
  assert.equal(skipped.code, 0, skipped.stderr);
  assert.deepEqual(skipped.calls, []);
  assert.equal(skipped.posts[0].skip.status, "skipped_quota");
  assert.equal(skipped.authEvents.length, 1);
  assert.equal(existsSync(skipped.authEvents[0].home), false);

  const ran = await runRunner({ adapterEnv: { CODEX_ACCESS_TOKEN: token, CODEX_API_KEY: "unused-api-key", RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" } });
  assert.equal(ran.code, 0, ran.stderr);
  assert.equal(ran.authEvents.length, 2);
  assert.equal(ran.execEvents.length, 1);
  assert.equal(ran.calls.length, 1);
  assert.equal(ran.execEvents[0].home, ran.authEvents[1].home);
  assert.notEqual(ran.authEvents[0].home, ran.authEvents[1].home);
  for (const event of ran.authEvents) {
    assert.equal(event.mode, 0o700);
    assert.equal(event.stdinMatches, true);
    assert.equal(event.envHasToken, false);
    assert.deepEqual(event.args, ["-c", 'cli_auth_credentials_store="file"', "login", "--with-access-token"]);
    assert.equal(existsSync(event.home), false);
  }
  assert.equal(ran.execEvents[0].envHasToken, false);
  assert.equal(ran.execEvents[0].envKeys.includes("CODEX_ACCESS_TOKEN"), false);
  assert.equal(ran.execEvents[0].envKeys.includes("CODEX_API_KEY"), false);
  assert.equal(ran.logs.includes(token) || ran.stderr.includes(token) || ran.stdout.includes(token), false);
  assert.equal(ran.posts[0].run.adapter.authSource, "codex");
  assert.equal(ran.posts[0].run.usage.costUsd, 0);
  assert.equal(ran.budgets[1].usd, 0);
});

test("invalid workspace token fails at start without a model call or network", async () => {
  const token = "invalid-workspace-token";
  const r = await runRunner({ adapterEnv: { CODEX_ACCESS_TOKEN: token, RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /RESEARCH_ADAPTER=codex: Codex auth is unavailable: CODEX_ACCESS_TOKEN login failed/);
  assert.deepEqual(r.calls, []);
  assert.equal(r.posts.length + r.budgets.length, 0);
  assert.equal(r.authEvents.length, 1);
  assert.equal(existsSync(r.authEvents[0].home), false);
  assert.equal(r.logs.includes(token) || r.stderr.includes(token) || r.stdout.includes(token), false);
});

test("Codex errors redact the workspace token and remove its temporary home", async () => {
  const token = "test-workspace-token";
  const r = await runRunner({ adapterEnv: { CODEX_ACCESS_TOKEN: token, RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" }, execFailureEchoToken: true });
  assert.equal(r.calls.length, 1);
  assert.equal(r.posts[0].run.status, "failed");
  assert.equal(r.authEvents.length, 2);
  for (const event of r.authEvents) assert.equal(existsSync(event.home), false);
  assert.equal([r.logs, r.stderr, r.stdout, JSON.stringify(r.posts)].some((value) => value.includes(token)), false);
  assert.match(r.posts[0].run.stopReason, /\[redacted\]/);
});

test("codex run with a ChatGPT login: unknown quota skips with no model call, allow runs it", async () => {
  const home = mkdtempSync(join(tmpdir(), "codex-login-"));
  writeFileSync(join(home, "auth.json"), JSON.stringify({ tokens: { access_token: "stub" } }));
  const skipped = await runRunner({ adapterEnv: { CODEX_HOME: home } });
  assert.equal(skipped.code, 0, skipped.stderr);
  assert.deepEqual(skipped.calls, []);
  assert.deepEqual([skipped.posts.length, skipped.budgets.length], [1, 0]);
  assert.equal(skipped.posts[0].skip.status, "skipped_quota");
  const ran = await runRunner({ adapterEnv: { CODEX_HOME: home, RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" } });
  assert.equal(ran.code, 0, ran.stderr);
  assert.equal(ran.calls.length, 1);
  assert.equal(ran.posts[0].run.adapter.authSource, "codex");
  assert.equal(ran.posts[0].run.usage.costUsd, 0);
  assert.equal(ran.budgets[1].usd, 0);
  assert.deepEqual(ran.budgets.map((b) => b.authSource ?? null), ["codex", null]);
});

test("codex daily cap skips a login run before the model call", async () => {
  const home = mkdtempSync(join(tmpdir(), "codex-login-"));
  writeFileSync(join(home, "auth.json"), JSON.stringify({ tokens: { access_token: "stub" } }));
  const r = await runRunner({ adapterEnv: { CODEX_HOME: home, RESEARCH_CODEX_QUOTA_UNKNOWN: "allow" }, codexDailyCalls: 2 });
  assert.deepEqual(r.calls, []);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].skip.status, "skipped_cap");
  assert.equal(r.posts[0].skip.adapter, "codex");
});
