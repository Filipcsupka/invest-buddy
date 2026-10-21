import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./run-scan.mjs";
import { usageFromEnvelope } from "./extraction-log.mjs";
import { attachClaudeUsage, attachCliUsage, cutoffError } from "./anthropic-cutoff.mjs";

const countTools = (envelope) => {
  // Claude's JSON envelope does not always include the tool transcript.
  if (Number.isInteger(envelope?.web_searches) && Number.isInteger(envelope?.web_fetches)) return { webSearches: envelope.web_searches, webFetches: envelope.web_fetches };
  const calls = envelope?.tool_uses ?? envelope?.toolUses ?? envelope?.messages;
  if (!Array.isArray(calls)) return { webSearches: null, webFetches: null };
  const names = [];
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    if ((v.type === "tool_use" || v.name === "WebSearch" || v.name === "WebFetch") && typeof v.name === "string") names.push(v.name);
    for (const [key, value] of Object.entries(v)) if (key !== "input" && key !== "result") visit(value);
  };
  visit(calls);
  return { webSearches: names.filter((n) => n === "WebSearch").length, webFetches: names.filter((n) => n === "WebFetch").length };
};

export const claudeResearchAdapter = {
  name: "claude",
  authSource(env = process.env) { return env.ANTHROPIC_API_KEY ? "api" : "subscription"; },
  available(env = process.env) {
    return env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_API_KEY || env.CLAUDE_CONFIG_DIR
      ? { ok: true, reason: null } : { ok: false, reason: "Claude auth is unavailable" };
  },
  async quota() { return null; },
  async run({ prompt, model = "sonnet", maxTurns, timeoutMs, workDir, monitor }) {
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "dontAsk", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch", "--max-turns", String(maxTurns), "--model", model];
    let stdout;
    try { ({ out: stdout } = await runCli("claude", args, prompt, { timeoutMs, cwd: workDir, monitor })); }
    catch (error) {
      if (error.cutoff) throw error;
      let parsed;
      try { parsed = JSON.parse(error.stdout); } catch { /* CLI text */ }
      // A valid result can mention production capacity or limits as a research fact.
      const cutoffInput = parsed?.type === "result" && !parsed.is_error && !parsed.error ? { stderr: error.stderr, message: error.message } : error;
      throw cutoffError(cutoffInput) ?? attachCliUsage(error);
    }
    let envelope;
    try { envelope = JSON.parse(stdout); } catch { throw new Error("claude output is not JSON"); }
    if (envelope.is_error || envelope.type === "error" || envelope.error) {
      throw cutoffError(envelope) ?? attachClaudeUsage(new Error(`claude error: ${String(envelope.result ?? envelope.error?.message ?? envelope.subtype ?? "unknown").slice(0, 200)}`), envelope);
    }
    if (Array.isArray(envelope.permission_denials) && envelope.permission_denials.length) throw attachClaudeUsage(new Error("claude attempted a tool that is not allowed"), envelope);
    if (Number.isInteger(envelope.num_turns) && envelope.num_turns > maxTurns) throw attachClaudeUsage(new Error("claude exceeded max turns"), envelope);
    return { text: envelope.result, usage: usageFromEnvelope(envelope), ...countTools(envelope), costUsd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null, cutoff: null, model: Object.keys(envelope.modelUsage ?? {})[0] || model };
  },
};

// ---------- Codex ----------
// Keywords strict structured output does not accept. The validator in research-validate.mjs still enforces them on the reply.
const STRICT_DROP = new Set(["$schema", "$id", "$defs", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems", "default", "examples"]);

/** Strict output schema for `$defs.modelOutput`: refs inlined, unsupported keywords removed, every object closed with all properties required. */
export function deriveStrictSchema(schema, name = "modelOutput") {
  const defs = schema?.$defs ?? {};
  if (!defs[name]) throw new Error(`schema has no $defs.${name}`);
  const walk = (node, stack) => {
    if (Array.isArray(node)) return node.map((item) => walk(item, stack));
    if (!node || typeof node !== "object") return node;
    if (typeof node.$ref === "string") {
      const match = /^#\/\$defs\/([\w-]+)$/.exec(node.$ref);
      if (!match || !defs[match[1]]) throw new Error(`unresolvable $ref ${node.$ref}`);
      if (stack.includes(match[1])) throw new Error(`recursive $ref ${node.$ref}`);
      const rest = Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$ref"));
      return walk({ ...defs[match[1]], ...rest }, [...stack, match[1]]);
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (STRICT_DROP.has(key)) continue;
      if (key === "const") { out.enum = [value]; continue; }
      if (key === "properties") out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, stack)]));
      else out[key] = walk(value, stack);
    }
    if (out.properties || out.type === "object" || (Array.isArray(out.type) && out.type.includes("object"))) {
      if (!out.properties) throw new Error("object schema without properties cannot be strict");
      out.required = Object.keys(out.properties);
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(defs[name], [name]);
}

export const codexAuthJson = (env = process.env) => join(env.CODEX_HOME || join(env.HOME || "~", ".codex"), "auth.json");

const codexLoginStatus = (env) => {
  const status = spawnSync("codex", ["login", "status"], {
    env: { PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, CODEX_HOME: env.CODEX_HOME },
    encoding: "utf8", timeout: 5000,
  });
  return status.status === 0;
};

const createCodexHome = () => {
  const home = mkdtempSync(join(tmpdir(), "invest-codex-home-"));
  chmodSync(home, 0o700);
  return home;
};

const loginAccessToken = (env, home) => {
  const result = spawnSync("codex", ["-c", 'cli_auth_credentials_store="file"', "login", "--with-access-token"], {
    env: { PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, CODEX_HOME: home },
    input: env.CODEX_ACCESS_TOKEN, encoding: "utf8", timeout: 15000,
  });
  return result.status === 0 && codexLoginStatus({ ...env, CODEX_HOME: home });
};

const redactToken = (value, token) => typeof value === "string" && token ? value.replaceAll(token, "[redacted]") : value;

// Rate-limit percentages are read from any `rate_limits` object in the event stream; the CLI may not report them.
const rateLimitPcts = (value, inRate = false, found = []) => {
  if (Array.isArray(value)) { value.forEach((item) => rateLimitPcts(item, inRate, found)); return found; }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    const rate = inRate || /^rate_?limits?$/i.test(key);
    if (rate && /^used_?percent$/i.test(key) && Number.isFinite(item)) found.push(item);
    else rateLimitPcts(item, rate, found);
  }
  return found;
};

export function parseCodexEvents(stdout) {
  const events = [];
  for (const line of String(stdout ?? "").split("\n")) { try { const event = JSON.parse(line); if (event && typeof event === "object") events.push(event); } catch { /* not an event line */ } }
  let input = null, output = null, cached = null, searches = 0, failure = null;
  for (const event of events) {
    const u = event.type === "turn.completed" ? event.usage : null;
    if (u && Number.isInteger(u.input_tokens) && Number.isInteger(u.output_tokens)) {
      // input_tokens includes the cached part; keep the two apart so a sum does not count it twice.
      const hit = Number.isInteger(u.cached_input_tokens) ? u.cached_input_tokens : 0;
      input = (input ?? 0) + u.input_tokens - hit; output = (output ?? 0) + u.output_tokens; cached = (cached ?? 0) + hit;
    }
    if (event.type === "item.completed" && event.item?.type === "web_search") searches += 1;
    if (event.type === "turn.failed" || event.type === "error") failure = String(event.error?.message ?? event.message ?? "unknown");
  }
  const pcts = rateLimitPcts(events);
  return { usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cached, cacheCreationTokens: null, turns: null }, webSearches: searches || null, rateLimitPct: pcts.length ? Math.max(...pcts) : null, failure };
}

let lastCodexRateLimit = null; // seen in this process; no non-model probe exists, so the first call of a run cannot know it

export const codexResearchAdapter = {
  name: "codex",
  failAtStart: true,
  authSource(env = process.env) { return env.OPENAI_API_KEY ? "api" : "codex"; },
  defaultModel(env = process.env) { return env.RESEARCH_CODEX_MODEL || "default"; },
  available(env = process.env) {
    if (env.OPENAI_API_KEY) return { ok: true, reason: null };
    if (env.CODEX_ACCESS_TOKEN) {
      let home;
      try {
        home = createCodexHome();
        return loginAccessToken(env, home)
          ? { ok: true, reason: null }
          : { ok: false, reason: "Codex auth is unavailable: CODEX_ACCESS_TOKEN login failed" };
      } catch { return { ok: false, reason: "Codex auth is unavailable: CODEX_ACCESS_TOKEN login failed" }; }
      finally { if (home) rmSync(home, { recursive: true, force: true }); }
    }
    if (!existsSync(codexAuthJson(env))) return { ok: false, reason: `Codex auth is unavailable: provide ${codexAuthJson(env)} (a ChatGPT login in CODEX_HOME)` };
    if (!codexLoginStatus(env)) return { ok: false, reason: "Codex auth is unavailable: codex login status did not confirm a local login" };
    return { ok: true, reason: null };
  },
  async quota() { return lastCodexRateLimit === null ? null : { window: "codex", pct: lastCodexRateLimit, resetAt: null }; },
  async run({ prompt, schemaPath, timeoutMs, workDir, monitor, env = process.env }) {
    const ioDir = mkdtempSync(join(tmpdir(), "invest-codex-io-"));
    let tokenHome;
    try {
      if (env.CODEX_ACCESS_TOKEN) {
        tokenHome = createCodexHome();
        if (!loginAccessToken(env, tokenHome)) throw new Error("Codex access token login failed");
      }
      const schemaFile = join(ioDir, "output-schema.json"), replyFile = join(ioDir, "reply.json");
      writeFileSync(schemaFile, JSON.stringify(deriveStrictSchema(JSON.parse(readFileSync(schemaPath, "utf8")))));
      const args = ["--search", "-a", "never", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--output-schema", schemaFile, "-C", workDir, "-o", replyFile, "--json"];
      if (env.RESEARCH_CODEX_MODEL) args.push("-m", env.RESEARCH_CODEX_MODEL);
      args.push("-");
      let stdout;
      const execEnv = tokenHome ? { ...env, CODEX_HOME: tokenHome, OPENAI_API_KEY: undefined, CODEX_API_KEY: undefined } : env;
      try { ({ out: stdout } = await runCli("codex", args, prompt, { timeoutMs, cwd: workDir, monitor, env: execEnv })); }
      catch (error) {
        for (const key of ["message", "stdout", "stderr"]) error[key] = redactToken(error[key], env.CODEX_ACCESS_TOKEN);
        const parsed = parseCodexEvents(error.stdout);
        if (parsed.rateLimitPct !== null) lastCodexRateLimit = parsed.rateLimitPct;
        if (parsed.usage.inputTokens !== null) error.usage = parsed.usage;
        throw error;
      }
      const parsed = parseCodexEvents(stdout);
      if (parsed.rateLimitPct !== null) lastCodexRateLimit = parsed.rateLimitPct;
      const attach = (error) => Object.assign(error, parsed.usage.inputTokens === null ? {} : { usage: parsed.usage });
      if (parsed.failure) throw attach(new Error(`codex error: ${redactToken(parsed.failure, env.CODEX_ACCESS_TOKEN).slice(0, 200)}`));
      let text;
      try { text = readFileSync(replyFile, "utf8"); } catch { throw attach(new Error("codex wrote no reply file")); }
      if (!text.trim()) throw attach(new Error("codex reply file is empty"));
      return { text, usage: parsed.usage, webSearches: parsed.webSearches, webFetches: null, costUsd: 0, cutoff: null, model: env.RESEARCH_CODEX_MODEL || "default", rateLimitPct: parsed.rateLimitPct };
    } finally {
      rmSync(ioDir, { recursive: true, force: true });
      if (tokenHome) rmSync(tokenHome, { recursive: true, force: true });
    }
  },
};

export const resetCodexRateLimit = () => { lastCodexRateLimit = null; };

export function researchAdapter(name = "claude") {
  if (name === "claude") return claudeResearchAdapter;
  if (name === "codex") return codexResearchAdapter;
  throw new Error(`Unknown research adapter: ${name}`);
}
