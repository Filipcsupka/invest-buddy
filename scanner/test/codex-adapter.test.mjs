import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexResearchAdapter, deriveStrictSchema, parseCodexEvents, resetCodexRateLimit } from "../research-adapters.mjs";

const fixtureDir = mkdtempSync(join(tmpdir(), "codex-adapter-schema-"));
const schemaPath = join(fixtureDir, "schema.json");
const item = { type: "object", properties: { url: { type: "string", format: "uri", minLength: 1 }, quote: { type: "string", maxLength: 600 }, n: { type: "integer", minimum: 0, maximum: 5 } }, required: ["url"] };
writeFileSync(schemaPath, JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $defs: {
    item,
    modelOutput: { type: "object", required: ["findings"], properties: {
      findings: { type: "array", minItems: 0, maxItems: 5, items: { $ref: "#/$defs/item" } },
      candidates: { type: "array", items: { type: "object", properties: { symbol: { type: "string", pattern: "^[A-Z]+$" }, kind: { const: "x" } } } },
      chains: { type: "array", items: { type: "object", properties: { links: { type: "array", items: { $ref: "#/$defs/item" } } } } },
      notes: { type: ["string", "null"], default: null },
    } },
  },
}));
const sampleOutput = { findings: [{ url: "https://example.com/a", quote: "q", n: 1 }], candidates: [], chains: [], notes: null };

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
  assert.ok(objects >= 5);
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

const withFake = async (events, fn, { reply = JSON.stringify(sampleOutput), exit = 0, writeReply = true } = {}) => {
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
    assert.deepEqual(JSON.parse(result.text), sampleOutput);
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
  assert.equal(codexResearchAdapter.available({ HOME: home, OPENAI_API_KEY: "k" }).ok, true);
  writeFileSync(join(home, "auth.json"), "{}");
  assert.match(codexResearchAdapter.available(env).reason, /codex login status/);
  writeFileSync(join(home, "auth.json"), JSON.stringify({ tokens: { access_token: "stub" } }));
  assert.equal(codexResearchAdapter.available(env).ok, true);
  assert.equal(codexResearchAdapter.authSource({ OPENAI_API_KEY: "k" }), "api");
  assert.equal(codexResearchAdapter.authSource({}), "codex");
});

function fakeTokenCodex({ echoToken = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-token-"));
  const home = join(dir, "home"); mkdirSync(home);
  writeFileSync(join(dir, "reply.json"), JSON.stringify(sampleOutput));
  writeFileSync(join(dir, "events.jsonl"), JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 20 } }));
  if (echoToken) writeFileSync(join(dir, "echo-token"), "1");
  const bin = join(dir, "codex");
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);const d=__dirname;
if(a.join(' ')==='login status'){
  try{const x=JSON.parse(fs.readFileSync(process.env.CODEX_HOME+'/auth.json','utf8'));process.exit(x.personal_access_token==='test-workspace-token'?0:1)}catch{process.exit(1)}
}
if(a.includes('--with-access-token')){
  let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
    fs.appendFileSync(d+'/auth-events.log',JSON.stringify({home:process.env.CODEX_HOME,mode:fs.statSync(process.env.CODEX_HOME).mode&0o777,args:a,stdinMatches:input==='test-workspace-token',envHasToken:Object.values(process.env).includes(input)})+'\\n');
    if(input!=='test-workspace-token')process.exit(1);
    fs.writeFileSync(process.env.CODEX_HOME+'/auth.json',JSON.stringify({personal_access_token:input}));
  });
}else{
  fs.appendFileSync(d+'/exec-events.log',JSON.stringify({home:process.env.CODEX_HOME,envKeys:Object.keys(process.env),envHasToken:Object.values(process.env).includes('test-workspace-token')})+'\\n');
  process.stdin.resume();process.stdin.on('end',()=>{
    if(fs.existsSync(d+'/echo-token')){const x=JSON.parse(fs.readFileSync(process.env.CODEX_HOME+'/auth.json','utf8'));process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:x.personal_access_token}}));return}
    fs.writeFileSync(a[a.indexOf('-o')+1],fs.readFileSync(d+'/reply.json','utf8'));process.stdout.write(fs.readFileSync(d+'/events.jsonl','utf8'))
  });
}
`);
  chmodSync(bin, 0o755);
  const read = (name) => existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  return { env: { PATH: `${dir}:${process.env.PATH}`, HOME: home }, authEvents: () => read("auth-events.log"), execEvents: () => read("exec-events.log"), logs: () => ["auth-events.log", "exec-events.log"].filter((n) => existsSync(join(dir, n))).map((n) => readFileSync(join(dir, n), "utf8")).join("\n") };
}

test("workspace token is passed on stdin, checked at start and removed with its private home", async () => {
  const token = "test-workspace-token";
  const fake = fakeTokenCodex();
  const env = { ...fake.env, CODEX_ACCESS_TOKEN: token, CODEX_API_KEY: "unused-api-key" };
  assert.deepEqual(codexResearchAdapter.available(env), { ok: true, reason: null });
  const work = mkdtempSync(join(tmpdir(), "invest-research-"));
  const result = await codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work, env });
  assert.deepEqual(JSON.parse(result.text), sampleOutput);
  assert.equal(result.costUsd, 0);
  const auth = fake.authEvents(), exec = fake.execEvents();
  assert.equal(auth.length, 2);
  assert.equal(exec.length, 1);
  assert.equal(exec[0].home, auth[1].home);
  assert.notEqual(auth[0].home, auth[1].home);
  for (const event of auth) {
    assert.equal(event.mode, 0o700);
    assert.equal(event.stdinMatches, true);
    assert.equal(event.envHasToken, false);
    assert.deepEqual(event.args, ["-c", 'cli_auth_credentials_store="file"', "login", "--with-access-token"]);
    assert.equal(existsSync(event.home), false);
  }
  assert.equal(exec[0].envHasToken, false);
  assert.equal(exec[0].envKeys.includes("CODEX_ACCESS_TOKEN"), false);
  assert.equal(exec[0].envKeys.includes("CODEX_API_KEY"), false);
  assert.equal(fake.logs().includes(token), false);
});

test("invalid workspace token fails the auth check and the run without a model call", async () => {
  const token = "invalid-workspace-token";
  const fake = fakeTokenCodex();
  const env = { ...fake.env, CODEX_ACCESS_TOKEN: token };
  assert.match(codexResearchAdapter.available(env).reason, /CODEX_ACCESS_TOKEN login failed/);
  const work = mkdtempSync(join(tmpdir(), "invest-research-"));
  await assert.rejects(codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work, env }), /access token login failed/);
  assert.deepEqual(fake.execEvents(), []);
  for (const event of fake.authEvents()) assert.equal(existsSync(event.home), false);
  assert.equal(fake.logs().includes(token), false);
});

test("Codex errors redact the workspace token and remove its temporary home", async () => {
  const token = "test-workspace-token";
  const fake = fakeTokenCodex({ echoToken: true });
  const env = { ...fake.env, CODEX_ACCESS_TOKEN: token };
  const work = mkdtempSync(join(tmpdir(), "invest-research-"));
  await assert.rejects(codexResearchAdapter.run({ prompt: "p", schemaPath, timeoutMs: 20000, workDir: work, env }), (e) => /\[redacted\]/.test(e.message) && !e.message.includes(token));
  assert.equal(fake.execEvents().length, 1);
  for (const event of fake.authEvents()) assert.equal(existsSync(event.home), false);
});
