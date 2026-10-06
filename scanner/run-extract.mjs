#!/usr/bin/env node
// Script-first extractor. Reads stored documents (collected by scripts) from the web's bundle endpoint,
// asks Claude or Codex to fill the ticker scan fields WITHOUT any web tools, checks every quote against
// the stored text, and posts one run to the existing ingest route. No database credentials here.
// Usage: node scanner/run-extract.mjs [--dry-run] [--only NVDA,AMD | --symbols-file detect.json] [--agent claude|codex]
//        [--model NAME] [--concurrency 1..3] [--timeout-s 300] [--as-of YYYY-MM-DD] [--base-url http://web.invest.svc.cluster.local:3000]
//        [--bundle-dir DIR]   (offline: read DIR/<SYMBOL>.json instead of calling the web)
//        [--force]            (extract even when an applied run with the same input hash exists)  [--budget-usd 0.5]  (cap per model call, claude only)
// Model default is haiku for claude. Token use is recorded per ticker in extraction_runs and totalled at the end of the run.
// In a container: command ["node", "/app/scanner/run-extract.mjs"] (the image entrypoint is run-scan.mjs).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, extractJson, fill, withRetry, pool, getToken, lastUsTradingDay } from "./run-scan.mjs";
import { validateTicker, validatePayload } from "./validate.mjs";
import { checkEvidence } from "./quotes.mjs";
import { inputHash, usageFromEnvelope, alreadyExtracted, recordRun } from "./extraction-log.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SCAN_OUT_DIR || join(here, "out");
const MAX_FAIL_RATIO = 0.2;

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error("usage: run-extract.mjs [--dry-run] [--force] [--only A,B | --symbols-file detect.json] [--agent claude|codex] [--model NAME] [--concurrency 1-3] [--timeout-s 300] [--budget-usd 0.5] [--as-of YYYY-MM-DD] [--base-url URL] [--bundle-dir DIR]");
  process.exit(msg ? 2 : 0);
}
export function parseArgs(argv) {
  const o = { dryRun: false, force: false, budgetUsd: 0.5, only: null, symbolsFile: null, agent: "claude", model: null, concurrency: 3, timeoutS: 300, asOf: null, baseUrl: process.env.INGEST_BASE_URL || "http://web.invest.svc.cluster.local:3000", bundleDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`missing value for ${a}`); return argv[++i]; };
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--force") o.force = true;
    else if (a === "--budget-usd") o.budgetUsd = Number(val());
    else if (a === "--only") o.only = val().split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--symbols-file") o.symbolsFile = val();
    else if (a === "--agent") o.agent = val();
    else if (a === "--model") o.model = val();
    else if (a === "--concurrency") o.concurrency = Number(val());
    else if (a === "--timeout-s") o.timeoutS = Number(val());
    else if (a === "--as-of") o.asOf = val();
    else if (a === "--base-url") o.baseUrl = val().replace(/\/$/, "");
    else if (a === "--bundle-dir") o.bundleDir = val();
    else if (a === "-h" || a === "--help") usage();
    else usage(`unknown argument ${a}`);
  }
  if (!["claude", "codex"].includes(o.agent)) usage("--agent must be claude or codex");
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1) usage("--concurrency must be 1 to 3");
  o.concurrency = Math.min(o.concurrency, 3);
  if (!(o.timeoutS > 0)) usage("--timeout-s must be positive");
  if (!(o.budgetUsd > 0)) usage("--budget-usd must be positive");
  if (o.agent === "claude" && !o.model) o.model = "haiku";
  if (o.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) usage("--as-of must be YYYY-MM-DD");
  if (o.only && o.symbolsFile) usage("use --only or --symbols-file, not both");
  return o;
}

/**
 * Reads the `claude -p --output-format json` envelope. The call is meant to be one turn with no tools: more than one turn,
 * or any permission denial, means the model tried a tool, and the result is rejected.
 */
export function parseClaudeEnvelope(out, requested) {
  let env;
  try { env = JSON.parse(out); } catch { throw new Error("claude output is not JSON"); }
  if (env.is_error) throw new Error(`claude error: ${String(env.result ?? env.subtype ?? "unknown").slice(0, 200)}`);
  if (Number.isInteger(env.num_turns) && env.num_turns > 1) throw new Error(`claude used ${env.num_turns} turns; tool use is not allowed`);
  if (Array.isArray(env.permission_denials) && env.permission_denials.length) throw new Error("claude attempted a tool call; tool use is not allowed");
  const used = Object.keys(env.modelUsage ?? {});
  return { text: env.result, model: used[0] || requested || "default", usage: usageFromEnvelope(env), costUsd: typeof env.total_cost_usd === "number" ? env.total_cost_usd : null };
}

/** No web tools for claude (`--tools ""`, one turn). Codex gets a read-only sandbox in an empty temp dir: no web, but not a tool-free call. */
export async function callAgentNoTools(opts, prompt, work) {
  const timeoutMs = opts.timeoutS * 1000;
  if (opts.agent === "claude") {
    // claude 2.1.289 has no --max-turns; --max-budget-usd is the cap, and parseClaudeEnvelope rejects num_turns > 1.
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "dontAsk", "--tools", "", "--max-budget-usd", String(opts.budgetUsd)];
    if (opts.model) args.push("--model", opts.model);
    const { out } = await runCli("claude", args, prompt, { timeoutMs, cwd: work });
    return parseClaudeEnvelope(out, opts.model);
  }
  const last = join(work, `last-${randomUUID()}.txt`);
  const args = ["-a", "never", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--output-schema", join(here, "schema", "ticker-output.schema.json"), "-C", work, "-o", last];
  if (opts.model) args.push("-m", opts.model);
  args.push("-");
  await runCli("codex", args, prompt, { timeoutMs, cwd: work });
  return { text: readFileSync(last, "utf8"), model: opts.model || "default", usage: usageFromEnvelope(null), costUsd: null };
}

const USAGE_KEYS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "turns"];
/** Adds usage objects; a field stays null until some call reports it. */
export function addUsage(a, b) {
  const sum = {};
  for (const k of USAGE_KEYS) sum[k] = a[k] == null && b[k] == null ? null : (a[k] ?? 0) + (b[k] ?? 0);
  return sum;
}
const emptyUsage = () => addUsage({}, {});

async function loadBundle(opts, symbol, token, asOf) {
  if (opts.bundleDir) return JSON.parse(readFileSync(join(opts.bundleDir, `${symbol}.json`), "utf8"));
  const res = await fetch(`${opts.baseUrl}/api/ingest/bundle/${symbol}?asOf=${asOf}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`bundle HTTP ${res.status}`);
  return res.json();
}

/** Posts one ticker as its own scan (macro=skip: no macro result here, so the daily macro finding stays). Returns true when stored. */
export async function postTicker(opts, token, { asOf, model, output }, log) {
  const payload = {
    schemaVersion: 2, runId: randomUUID(), asOf, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), runner: { name: opts.agent, model }, tickers: [output],
    macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "Macro not extracted in this script-first run; values unknown.", evidence: [], events: [] },
  };
  try {
    const res = await fetch(`${opts.baseUrl}/api/ingest/scan?macro=skip`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    if (!res.ok) { log(`${output.symbol}: POST failed: HTTP ${res.status} ${text.slice(0, 300)}`); return false; }
    log(`${output.symbol}: POST ok: HTTP ${res.status} ${text.slice(0, 200)}`);
    return true;
  } catch (e) { log(`${output.symbol}: POST error: ${e.message}`); return false; }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const universe = JSON.parse(readFileSync(join(here, "universe.json"), "utf8")).instruments;
  let wanted = opts.only;
  if (opts.symbolsFile) wanted = JSON.parse(readFileSync(opts.symbolsFile, "utf8")).symbols;
  const selected = wanted ? universe.filter((u) => wanted.includes(u.symbol)) : universe;
  const unknown = (wanted ?? []).filter((s) => !universe.some((u) => u.symbol === s));
  if (unknown.length) usage(`not in universe.json: ${unknown.join(", ")}`);
  if (!selected.length) { console.error("nothing to extract"); return; }
  const asOf = opts.asOf || lastUsTradingDay();
  const runId = randomUUID();
  mkdirSync(OUT, { recursive: true });
  const logFile = join(OUT, `extract-${asOf}-${runId.slice(0, 8)}.log`);
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.error(line); appendFileSync(logFile, line + "\n"); };
  log(`extract ${runId} asOf=${asOf} agent=${opts.agent} model=${opts.model || "default"} tickers=${selected.length} dryRun=${opts.dryRun} force=${opts.force} offline=${Boolean(opts.bundleDir)}`);
  const token = opts.bundleDir && opts.dryRun ? null : getToken();
  if (!token && !(opts.bundleDir && opts.dryRun)) { log("no INGEST_TOKEN; aborting"); process.exit(2); }
  // Dry runs never touch extraction_runs: an ok row without a posted scan would make the next real run skip the ticker.
  const logRuns = Boolean(token) && !opts.dryRun;
  const prompt = readFileSync(join(here, "prompts", "ticker-extract.md"), "utf8");
  const work = mkdtempSync(join(tmpdir(), "investbuddy-extract-"));
  let model = opts.model || "default";
  const failed = [], tickers = [], droppedAll = {}, skippedSymbols = [], postFailed = [];
  let totals = emptyUsage(), totalCost = 0, calls = 0, inputChars = 0;
  await pool(selected, opts.concurrency, async (u) => {
    const t0 = Date.now();
    let spent = emptyUsage(), hash = null, tickerModel = opts.model || "default";
    try {
      const bundle = await withRetry(() => loadBundle(opts, u.symbol, token, asOf), log, `${u.symbol} bundle`);
      if (!bundle.documents?.length && !bundle.facts?.length) throw Object.assign(new Error("empty bundle"), { skip: true });
      hash = inputHash({ bundle, prompt, agent: opts.agent, model: opts.model });
      if (logRuns && !opts.force && await alreadyExtracted(opts.baseUrl, token, { symbol: u.symbol, agent: opts.agent, inputHash: hash })) {
        skippedSymbols.push(u.symbol);
        log(`${u.symbol}: SKIPPED same input already extracted and applied (input ${hash.slice(0, 12)}); use --force to rerun`);
        return;
      }
      const value = await withRetry(async () => {
        const text = fill(prompt, { SYMBOL: u.symbol, NAME: u.name, SECTOR: u.sector, AS_OF: asOf, BUNDLE: JSON.stringify(bundle) });
        inputChars += text.length;
        const r = await callAgentNoTools(opts, text, work);
        calls++;
        spent = addUsage(spent, r.usage);
        totalCost += r.costUsd ?? 0;
        if (r.model && r.model !== "default") { model = r.model; tickerModel = r.model; }
        const obj = extractJson(r.text);
        if (obj.symbol !== u.symbol) throw new Error(`symbol mismatch: got ${obj.symbol}`);
        const checked = checkEvidence(obj, bundle, { asOf });
        const errs = validateTicker(checked.output);
        if (errs.length) throw new Error(`schema: ${errs.slice(0, 5).join("; ")}`);
        if (checked.dropped.length) droppedAll[u.symbol] = checked.dropped; else delete droppedAll[u.symbol];
        return { output: checked.output, chars: text.length };
      }, log, u.symbol);
      totals = addUsage(totals, spent);
      log(`${u.symbol}: ok in ${Math.round((Date.now() - t0) / 1000)}s, input ${value.chars} chars, tokens in/out ${spent.inputTokens ?? "?"}/${spent.outputTokens ?? "?"} (cache read ${spent.cacheReadTokens ?? "?"}, created ${spent.cacheCreationTokens ?? "?"}), turns ${spent.turns ?? "?"}${droppedAll[u.symbol] ? `, ${droppedAll[u.symbol].length} claims downgraded` : ""}`);
      tickers.push(value.output);
      if (!opts.dryRun) {
        // Each result is stored as soon as it is ready, so a killed run keeps its progress and the skip key makes the rerun cheap.
        const run = { symbol: u.symbol, asOf, agent: opts.agent, model: tickerModel, inputHash: hash, usage: spent, output: value.output };
        const posted = await postTicker(opts, token, { asOf, model: tickerModel, output: value.output }, log);
        // ok is recorded only after the scan is stored, so an unapplied result is never skipped on the next run.
        await recordRun(opts.baseUrl, token, posted ? { ...run, status: "ok", applied: true } : { ...run, output: undefined, status: "failed", error: "POST /api/ingest/scan failed; result not applied", applied: false }, log);
        if (!posted) postFailed.push(u.symbol);
      }
    } catch (e) {
      totals = addUsage(totals, spent);
      log(`${u.symbol}: ${e.skip ? "SKIPPED" : "FAILED"} ${e.message}`);
      if (!e.skip) {
        failed.push({ symbol: u.symbol, reason: e.message });
        if (logRuns && hash) await recordRun(opts.baseUrl, token, { symbol: u.symbol, asOf, agent: opts.agent, model: tickerModel, inputHash: hash, status: "failed", usage: spent, error: e.message.slice(0, 2000), applied: false }, log);
      }
    }
  });
  if (!process.env.SCAN_KEEP_WORK) rmSync(work, { recursive: true, force: true });
  const payload = {
    schemaVersion: 2, runId, asOf, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), runner: { name: opts.agent, model }, tickers,
    macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "Macro not extracted in this script-first run; values unknown.", evidence: [], events: [] },
  };
  const errs = validatePayload(payload);
  if (errs.length) { log(`assembled payload invalid: ${errs.join("; ")}`); process.exit(1); }
  const payloadFile = join(OUT, `extract-payload-${asOf}-${opts.agent}-${runId.slice(0, 8)}.json`);
  writeFileSync(payloadFile, JSON.stringify({ ...payload, _droppedClaims: droppedAll }, null, 2) + "\n");
  log(`payload written ${payloadFile} (${tickers.length} tickers)`);
  const logTotals = () => log(`totals: ${calls} model calls, ${inputChars} input chars, tokens in ${totals.inputTokens ?? "?"} out ${totals.outputTokens ?? "?"} cache read ${totals.cacheReadTokens ?? "?"} cache created ${totals.cacheCreationTokens ?? "?"}, turns ${totals.turns ?? "?"}${totalCost ? `, cost $${totalCost.toFixed(4)}` : ""}; ok ${tickers.length}, skipped ${skippedSymbols.length}, failed ${failed.length}`);
  if (!opts.dryRun) {
    if (!tickers.length) { logTotals(); log("no valid tickers; not posting"); process.exit(failed.length ? 1 : 0); }
    if (postFailed.length) { logTotals(); log(`not stored: ${postFailed.join(", ")}`); process.exit(3); }
  } else log("dry run: nothing posted, nothing recorded");
  logTotals();
  if (failed.length / selected.length > MAX_FAIL_RATIO) { log(`failure ratio exceeds ${MAX_FAIL_RATIO * 100}%: ${failed.map((f) => f.symbol).join(", ")}`); process.exit(1); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(`fatal: ${e.stack || e.message}`); process.exit(1); });
