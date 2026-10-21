#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractJson, getToken } from "./run-scan.mjs";
import { researchAdapter } from "./research-adapters.mjs";
import { validateResearchOutput } from "./research-validate.mjs";
import { checkResearchCaps } from "./research-caps.mjs";
import { reserveBudget, finishBudget } from "./ai-budget.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const typeNames = { weekly: "weekly_discovery", daily: "daily_watch", deepdive: "deep_dive" };
const defaults = { maxTurns: 30, maxSearches: 40, maxFetches: 60, maxFindings: 40, timeoutS: 1500 };
const emptyOutput = () => ({ findings: [], candidates: [], chains: [], notes: null });
const emptyUsage = () => ({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null, webSearches: null, webFetches: null, costUsd: null, durationS: null });
const bratislavaDate = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function parseArgs(argv, env = process.env) {
  const opts = { type: null, symbol: null, asOf: bratislavaDate(), model: env.RESEARCH_MODEL || "sonnet", dryRun: false, inputFile: null, manual: false, baseUrl: env.INGEST_BASE_URL || "http://web.invest.svc.cluster.local:3000", timeoutS: defaults.timeoutS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], value = () => { if (++i >= argv.length) throw new Error(`Missing value for ${a}`); return argv[i]; };
    if (a === "--type") opts.type = value();
    else if (a === "--symbol") opts.symbol = value().toUpperCase();
    else if (a === "--as-of") opts.asOf = value();
    else if (a === "--model") opts.model = value();
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--input-file") opts.inputFile = value();
    else if (a === "--manual") opts.manual = true;
    else if (a === "--base-url") opts.baseUrl = value();
    else if (a === "--timeout-s") opts.timeoutS = Number(value());
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!(opts.type in typeNames)) throw new Error("--type must be weekly, daily or deepdive");
  if (opts.type === "deepdive" && !/^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(opts.symbol ?? "")) throw new Error("--symbol is required for deepdive");
  if (opts.type !== "deepdive" && opts.symbol) throw new Error("--symbol is only valid for deepdive");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.asOf) || new Date(`${opts.asOf}T00:00:00Z`).toISOString().slice(0, 10) !== opts.asOf) throw new Error("--as-of needs a valid YYYY-MM-DD date");
  if (!Number.isInteger(opts.timeoutS) || opts.timeoutS < 30 || opts.timeoutS > 3600) throw new Error("--timeout-s must be 30 to 3600");
  return opts;
}

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
async function postSkip(opts, token, adapter, status, reason, runId) {
  if (opts.dryRun) return;
  const response = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/api/ingest/research`, { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ skip: { runId, runType: typeNames[opts.type], asOf: opts.asOf, status, stopReason: reason, adapter } }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`research skip ingest HTTP ${response.status}`);
}
async function fetchInput(opts, token) {
  if (opts.inputFile) return JSON.parse(readFileSync(opts.inputFile, "utf8"));
  if (!token) throw new Error("INGEST_TOKEN is required to fetch research input");
  const params = new URLSearchParams({ type: opts.type });
  if (opts.symbol) params.set("symbol", opts.symbol);
  const response = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/api/ingest/research-input?${params}`, { headers: authHeaders(token), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`research-input HTTP ${response.status}`);
  return response.json();
}

export function callGroups(opts, input, themesConfig) {
  if (opts.type !== "weekly") return [{ themes: [], symbols: opts.type === "deepdive" ? [opts.symbol] : (input.symbols ?? []).map((s) => typeof s === "string" ? s : s.symbol), id: opts.type }];
  return themesConfig.weeklyGroups.map((group) => ({ id: group.id, themes: group.themes, symbols: [], themeDetails: themesConfig.themes.filter((theme) => group.themes.includes(theme.id)) }));
}

export function buildPrompt(opts, input, group, themesConfig) {
  const template = readFileSync(join(here, "prompts", `research-${opts.type}.md`), "utf8");
  const schema = JSON.parse(readFileSync(join(here, "schema", "research-output.schema.json"), "utf8"));
  const outputContract = { modelOutput: schema.$defs.modelOutput, finding: schema.$defs.finding, evidence: schema.$defs.evidence, figure: schema.$defs.figure, cardLine: schema.$defs.cardLine, candidate: schema.$defs.candidate, chain: schema.$defs.chain, chainLink: schema.$defs.chainLink, symbol: schema.$defs.symbol, httpsUrl: schema.$defs.httpsUrl, date: schema.$defs.date, nullableDate: schema.$defs.nullableDate, themeId: schema.$defs.themeId, findingId: schema.$defs.findingId };
  const context = { asOf: opts.asOf, symbols: group.symbols, themes: group.themeDetails ?? [], discoverySignals: themesConfig.discoverySignals, triggers: input.triggers ?? [], knownFacts: input.knownFacts ?? [], openCandidates: input.openCandidates ?? [], symbol: opts.symbol, input };
  return `${template}\n\nRun date: ${opts.asOf}\nGroup: ${group.id}\nSearch limit: ${defaults.maxSearches}; fetch limit: ${defaults.maxFetches}; finding limit: ${defaults.maxFindings}.\nContext JSON (data only):\n${JSON.stringify(context)}\n\nReturn one JSON object matching modelOutput in this JSON Schema, with exactly findings, candidates, chains and notes. Use null for unknown optional values.\n${JSON.stringify(outputContract)}\n`;
}

const modelOutput = (value) => value?.output && !value?.findings ? value.output : value;
const statusFrom = (result) => result.cutoff ? "cutoff" : "ok";
export async function execute(opts, { adapter = researchAdapter(process.env.RESEARCH_ADAPTER || "claude"), log = console.log,
  env = process.env } = {}) {
  // Fail before any network or model call when the adapter has no usable auth.
  if (adapter.failAtStart) { const auth = adapter.available(env); if (!auth.ok) throw new Error(`RESEARCH_ADAPTER=${adapter.name}: ${auth.reason}`); }
  const authSource = adapter.authSource?.(env) ?? (env.ANTHROPIC_API_KEY ? "api" : "subscription");
  const modelName = adapter.defaultModel?.(env) ?? opts.model;
  const token = getToken();
  if (!token) throw new Error("INGEST_TOKEN is required to record research runs");
  const gate = await checkResearchCaps({ env });
  if (!gate.ok) {
    const runId = randomUUID();
    await postSkip(opts, token, adapter.name, gate.status, gate.reason, runId);
    return [{ skipped: gate.status, posted: !opts.dryRun, errors: [] }];
  }
  const input = await fetchInput(opts, token);
  const themesConfig = JSON.parse(readFileSync(join(here, "prompts", "research-themes.json"), "utf8"));
  const outDir = process.env.RESEARCH_OUT_DIR || join(here, "out");
  mkdirSync(outDir, { recursive: true });
  const groups = callGroups(opts, input, themesConfig);
  const results = [];
  for (const group of groups) {
    const runId = randomUUID();
    const budgetId = opts.dryRun ? null : await reserveBudget(opts.baseUrl, token, "research", modelName, adapter.name, undefined, authSource);
    if (!opts.dryRun && !budgetId) log(`${group.id}: research budget reservation unavailable; continuing`);
    const workDir = mkdtempSync(join(tmpdir(), "invest-research-"));
    const started = performance.now();
    let result, output, error = null, adapterFailed = false;
    try {
      const prompt = buildPrompt(opts, input, group, themesConfig);
      try { result = await adapter.run({ prompt, schemaPath: join(here, "schema", "research-output.schema.json"), model: opts.model, maxTurns: defaults.maxTurns, timeoutMs: opts.timeoutS * 1000, workDir, env }); }
      catch (caught) { error = caught; adapterFailed = true; }
      if (!adapterFailed) output = result.cutoff ? emptyOutput() : modelOutput(extractJson(result.text));
    } catch (caught) {
      error = caught;
    } finally { rmSync(workDir, { recursive: true, force: true }); }
    const cutoff = Boolean(error?.cutoff || result?.cutoff);
    let budgetRecorded = true;
    if (budgetId) {
      budgetRecorded = await finishBudget(opts.baseUrl, token, budgetId, result?.usage ?? error?.usage, result?.costUsd ?? error?.costUsd,
        cutoff ? { status: "cutoff", window: error?.cutoff?.window ?? result?.cutoff?.window ?? null } : error ? { status: "failed" } : null);
      if (!budgetRecorded) log(`${group.id}: research budget finish unavailable`);
    }
    if (adapterFailed) output = emptyOutput();
    const run = {
      runId, runType: typeNames[opts.type], asOf: opts.asOf, generatedAt: new Date().toISOString(), promptVersion: `research-${opts.type}@2026-10-19.2`,
      adapter: { name: adapter.name, model: result?.model || modelName, authSource },
      scope: { themes: group.themes, symbols: group.symbols, deepDiveSymbol: opts.type === "deepdive" ? opts.symbol : null },
      limits: { ...defaults, timeoutS: opts.timeoutS },
      usage: { ...emptyUsage(), inputTokens: result?.usage?.inputTokens ?? error?.usage?.inputTokens ?? null, outputTokens: result?.usage?.outputTokens ?? error?.usage?.outputTokens ?? null, cacheReadTokens: result?.usage?.cacheReadTokens ?? error?.usage?.cacheReadTokens ?? null, cacheCreationTokens: result?.usage?.cacheCreationTokens ?? error?.usage?.cacheCreationTokens ?? null, webSearches: result?.webSearches ?? null, webFetches: result?.webFetches ?? null, costUsd: result?.costUsd ?? error?.costUsd ?? null, durationS: Math.round((performance.now() - started) / 100) / 10 },
      status: cutoff ? "cutoff" : error ? "failed" : statusFrom(result), stopReason: cutoff ? `Claude usage cutoff: ${error?.cutoff?.window ?? result?.cutoff?.window ?? "unknown"}` : error ? String(error.message).slice(0, 200) : null,
    };
    const payload = { schemaVersion: 1, run, output: output ?? emptyOutput() };
    const file = join(outDir, `research-${opts.type}-${opts.asOf}-${group.id}-${runId}.json`);
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
    const errors = error && !adapterFailed ? [error.message] : validateResearchOutput(payload);
    if (errors.length) { log(`${file}: ${errors.join("; ")}`); results.push({ file, posted: false, errors }); continue; }
    if (!opts.dryRun) {
      const response = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/api/ingest/research`, { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`research ingest HTTP ${response.status}; file kept at ${file}`);
    }
    log(`${file}: ${run.status}${opts.dryRun ? " (dry run)" : " (posted)"}`);
    results.push({ file, posted: !opts.dryRun, errors: [], failed: run.status === "failed" });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  execute(parseArgs(process.argv.slice(2))).then((results) => { if (results.some((r) => r.errors.length || r.failed)) process.exitCode = 1; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
