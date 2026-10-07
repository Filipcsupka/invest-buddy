#!/usr/bin/env node
// InvestBuddy scan runner. Runs a headless Claude Code or Codex CLI per ticker,
// validates the JSON against the scan contract, and posts one run payload.
// Usage: node scanner/run-scan.mjs [--dry-run] [--only NVDA,AMD] [--agent claude|codex]
//        [--model NAME] [--concurrency 1..3] [--timeout-s 300] [--as-of YYYY-MM-DD] [--url URL]
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTicker, validateMacro, validatePayload } from "./validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SCAN_OUT_DIR || join(here, "out");
const KEYCHAIN_SERVICE = "investbuddy-ingest";
const MAX_FAIL_RATIO = 0.2;

// ---------- args ----------
function parseArgs(argv) {
  const o = { dryRun: false, only: null, agent: "claude", model: null, concurrency: 3, timeoutS: 300, asOf: null, url: process.env.INGEST_URL || "http://web.invest.svc.cluster.local:3000/api/ingest/scan" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`missing value for ${a}`); return argv[++i]; };
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--only") o.only = val().split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--agent") { o.agent = val(); if (!["claude", "codex"].includes(o.agent)) usage("--agent must be claude or codex"); }
    else if (a === "--model") o.model = val();
    else if (a === "--concurrency") o.concurrency = Number(val());
    else if (a === "--timeout-s") o.timeoutS = Number(val());
    else if (a === "--as-of") o.asOf = val();
    else if (a === "--url") o.url = val();
    else if (a === "-h" || a === "--help") usage();
    else usage(`unknown argument ${a}`);
  }
  if (!["claude", "codex"].includes(o.agent)) usage("--agent must be claude or codex");
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1) usage("--concurrency must be 1 to 3");
  o.concurrency = Math.min(o.concurrency, 3);
  if (!(o.timeoutS > 0)) usage("--timeout-s must be positive");
  if (o.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) usage("--as-of must be YYYY-MM-DD");
  return o;
}
function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error("usage: run-scan.mjs [--dry-run] [--only NVDA,AMD] [--agent claude|codex] [--model NAME] [--concurrency 1-3] [--timeout-s 300] [--as-of YYYY-MM-DD] [--url URL]");
  process.exit(msg ? 2 : 0);
}

// ---------- helpers ----------
export function lastUsTradingDay(now = new Date()) {
  // Last completed weekday session in New York. US market holidays are not modelled; use --as-of to override.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const d = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
  const afterClose = +parts.hour * 60 + +parts.minute >= 16 * 60 + 30;
  const isWeekday = (x) => x.getUTCDay() >= 1 && x.getUTCDay() <= 5;
  if (!(isWeekday(d) && afterClose)) d.setUTCDate(d.getUTCDate() - 1);
  while (!isWeekday(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getToken() {
  if (process.env.INGEST_TOKEN) return process.env.INGEST_TOKEN.trim();
  if (process.platform === "darwin") {
    try {
      return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", userInfo().username, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch { /* fall through */ }
  }
  return null;
}

// Extract the first balanced JSON object from model text (tolerates fences or stray prose).
export function extractJson(text) {
  const s = String(text ?? "");
  for (let start = s.indexOf("{"); start !== -1; start = s.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  throw new Error("no JSON object in model output");
}

export function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

// ---------- agent auth ----------
// claude: CLAUDE_CODE_OAUTH_TOKEN (subscription, from `claude setup-token`) or ANTHROPIC_API_KEY, or a local /login.
// With both set, the CLI prefers ANTHROPIC_API_KEY (Anthropic docs, auth precedence). Warn so it is not a surprise.
function checkAuth(opts, log) {
  if (opts.agent === "codex") {
    const home = process.env.CODEX_HOME || join(process.env.HOME || "~", ".codex");
    const hasKey = !!process.env.OPENAI_API_KEY || !!process.env.CODEX_API_KEY;
    log(`codex auth: CODEX_HOME=${home} auth.json ${existsSync(join(home, "auth.json")) ? "present" : "missing"}${hasKey ? "; an API key env var is set" : ""}`);
    return;
  }
  const key = !!process.env.ANTHROPIC_API_KEY, oauth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (key && oauth) log("both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN set; the CLI uses the API key");
  else if (key) log("claude auth: ANTHROPIC_API_KEY (API billing)");
  else if (oauth) log("claude auth: CLAUDE_CODE_OAUTH_TOKEN (subscription token)");
  else log("claude auth: no token env var; relying on a local login (fine on a Mac, will fail in a container)");
}

// ---------- agent call ----------
export function agentEnv(source = process.env) {
  const allowed = new Set(["PATH", "HOME", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "USER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CODEX_API_KEY", "LANG", "LANGUAGE", "LC_ALL", "TZ", "TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => value !== undefined && (allowed.has(key) || /^LC_[A-Z_]+$/.test(key))));
}

export function runCli(cmd, args, input, { timeoutMs, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: agentEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 5000).unref(); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`timeout after ${timeoutMs / 1000}s`));
      if (code !== 0) return reject(Object.assign(new Error(`${cmd} exited ${code}`), { stdout: out, stderr: err, code }));
      resolve({ out, err });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function callAgent(opts, prompt, work, kind) {
  const timeoutMs = opts.timeoutS * 1000;
  if (opts.agent === "claude") {
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "dontAsk", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch"];
    if (opts.model) args.push("--model", opts.model);
    const { out } = await runCli("claude", args, prompt, { timeoutMs, cwd: work });
    let env;
    try { env = JSON.parse(out); } catch { throw new Error("claude output is not JSON"); }
    if (env.is_error) throw new Error(`claude error: ${String(env.result ?? env.subtype ?? "unknown").slice(0, 200)}`);
    const model = opts.model || Object.keys(env.modelUsage ?? {})[0] || "default";
    return { text: env.result, model };
  }
  const last = join(work, `last-${randomUUID()}.txt`);
  // Flags checked against codex-cli 0.160.0 `codex --help` / `codex exec --help`:
  // --search and -a are top-level flags (before `exec`); --output-schema, --ephemeral, --ignore-user-config are exec flags.
  // --ignore-user-config keeps ~/.codex/config.toml (MCP servers, profiles) out of the run; auth still comes from CODEX_HOME.
  const schemaFile = join(here, "schema", kind === "macro" ? "macro-output.schema.json" : "ticker-output.schema.json");
  const args = ["--search", "-a", "never", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--output-schema", schemaFile, "-C", work, "-o", last];
  if (opts.model) args.push("-m", opts.model);
  args.push("-");
  await runCli("codex", args, prompt, { timeoutMs, cwd: work });
  return { text: readFileSync(last, "utf8"), model: opts.model || "default" };
}

export async function withRetry(fn, log, label) {
  try { return await fn(); } catch (e1) {
    if (e1.exitCode === 5) throw e1;
    log(`${label}: attempt 1 failed: ${e1.message}`);
    try { return await fn(); } catch (e2) { log(`${label}: attempt 2 failed: ${e2.message}`); throw e2; }
  }
}

export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await worker(items[i]); }
  }));
  return results;
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const universe = JSON.parse(readFileSync(join(here, "universe.json"), "utf8")).instruments;
  let selected = universe;
  if (opts.only) {
    const unknown = opts.only.filter((s) => !universe.some((u) => u.symbol === s));
    if (unknown.length) usage(`not in universe.json: ${unknown.join(", ")}`);
    selected = universe.filter((u) => opts.only.includes(u.symbol));
  }
  const asOf = opts.asOf || lastUsTradingDay();
  const today = new Date().toISOString().slice(0, 10);
  const runId = randomUUID();

  mkdirSync(OUT, { recursive: true });
  const logFile = join(OUT, `run-${asOf}-${runId.slice(0, 8)}.log`);
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.error(line); appendFileSync(logFile, line + "\n"); };
  log(`run ${runId} asOf=${asOf} agent=${opts.agent} model=${opts.model ?? "default"} tickers=${selected.length} dryRun=${opts.dryRun} concurrency=${opts.concurrency}`);

  let token = null;
  if (!opts.dryRun) {
    token = getToken();
    if (!token) { log("no INGEST_TOKEN in env or Keychain (service investbuddy-ingest); aborting before any agent call"); process.exit(2); }
  }

  checkAuth(opts, log);
  const tickerPrompt = readFileSync(join(here, "prompts", "ticker-scan.md"), "utf8");
  const macroPrompt = readFileSync(join(here, "prompts", "macro-scan.md"), "utf8");
  const work = mkdtempSync(join(tmpdir(), "investbuddy-scan-"));
  let model = opts.model || "default";

  const failed = [];
  const jobs = [{ kind: "macro" }, ...selected.map((u) => ({ kind: "ticker", u }))];

  const results = await pool(jobs, opts.concurrency, async (job) => {
    const label = job.kind === "macro" ? "macro" : job.u.symbol;
    const t0 = Date.now();
    try {
      const value = await withRetry(async () => {
        const prompt = job.kind === "macro"
          ? fill(macroPrompt, { AS_OF: asOf, TODAY: today })
          : fill(tickerPrompt, { SYMBOL: job.u.symbol, NAME: job.u.name, SECTOR: job.u.sector, AS_OF: asOf });
        const r = await callAgent(opts, prompt, work, job.kind);
        if (r.model && r.model !== "default") model = r.model;
        const obj = extractJson(r.text);
        if (job.kind === "ticker" && obj.symbol !== job.u.symbol) throw new Error(`symbol mismatch: got ${obj.symbol}`);
        const errs = job.kind === "macro" ? validateMacro(obj) : validateTicker(obj);
        if (errs.length) throw new Error(`schema: ${errs.slice(0, 5).join("; ")}`);
        return obj;
      }, log, label);
      log(`${label}: ok in ${Math.round((Date.now() - t0) / 1000)}s`);
      return { job, value };
    } catch (e) {
      log(`${label}: FAILED ${e.message}`);
      return { job, error: e.message };
    }
  });

  if (!process.env.SCAN_KEEP_WORK) rmSync(work, { recursive: true, force: true });

  let macro = null;
  const tickers = [];
  for (const r of results) {
    if (r.job.kind === "macro") { if (r.value) macro = r.value; else failed.push({ symbol: "macro", reason: r.error }); }
    else if (r.value) tickers.push(r.value);
    else failed.push({ symbol: r.job.u.symbol, reason: r.error });
  }
  if (!macro) {
    // Contract requires a macro object; unknown scores zero points server side.
    macro = { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "Macro scan failed in this run; values unknown.", evidence: [], events: [] };
  }

  const payload = {
    schemaVersion: 2, runId, asOf, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    runner: { name: opts.agent, model, dataMode: "real" },
    tickers, macro,
  };
  const errs = validatePayload(payload);
  if (errs.length) { log(`assembled payload invalid: ${errs.join("; ")}`); process.exit(1); }

  const payloadFile = join(OUT, `payload-${asOf}-${opts.agent}-${runId.slice(0, 8)}.json`);
  writeFileSync(payloadFile, JSON.stringify(payload, null, 2) + "\n");
  log(`payload written ${payloadFile} (${tickers.length} tickers)`);

  if (!opts.dryRun) {
    if (tickers.length === 0) { log("no valid tickers; not posting"); process.exit(1); }
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body) > 1_000_000) { log("payload over 1 MB; not posting"); process.exit(1); }
    try {
      const res = await fetch(opts.url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (!res.ok) { log(`POST failed: HTTP ${res.status} ${text.slice(0, 300)}`); process.exit(3); }
      let r = {}; try { r = JSON.parse(text); } catch { /* keep empty */ }
      log(`POST ok: HTTP ${res.status} replayed=${r.replayed ?? "?"} accepted=${JSON.stringify(r.accepted ?? "?")}`);
      for (const rej of r.rejected ?? []) { log(`server rejected ${rej.symbol}: ${rej.reason}`); failed.push({ symbol: rej.symbol, reason: `server: ${rej.reason}` }); }
    } catch (e) { log(`POST error: ${e.message}`); process.exit(3); }
  } else {
    log("dry run: nothing posted");
  }

  const total = selected.length + 1;
  const ratio = failed.length / total;
  if (failed.length) log(`failed (${failed.length}/${total}): ${failed.map((f) => f.symbol).join(", ")}`);
  log(`done ok=${total - failed.length} failed=${failed.length}`);
  if (ratio > MAX_FAIL_RATIO) { log(`failure ratio ${(ratio * 100).toFixed(0)}% exceeds ${MAX_FAIL_RATIO * 100}%`); process.exit(1); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(`fatal: ${e.stack || e.message}`); process.exit(1); });
