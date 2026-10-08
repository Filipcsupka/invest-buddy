#!/usr/bin/env node
// Script-first extractor. Reads stored documents (collected by scripts) from the web's bundle endpoint,
// asks Claude or Codex to fill the ticker scan fields WITHOUT any web tools, checks every quote against
// the stored text, and posts one run to the existing ingest route. No database credentials here.
// Usage: node scanner/run-extract.mjs [--dry-run] [--only NVDA,AMD | --symbols-file detect.json] [--agent claude|codex]
//        [--model NAME] [--concurrency 1..3] [--timeout-s 300] [--as-of YYYY-MM-DD] [--base-url http://web.invest.svc.cluster.local:3000]
//        [--bundle-dir DIR]   (offline: read DIR/<SYMBOL>.json instead of calling the web)
//        [--force]            (extract even when an applied run with the same input hash exists)
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
import { inputHash, usageFromEnvelope, alreadyExtracted, recordRun, reviewDue } from "./extraction-log.mjs";
import { reserveBudget, finishBudget, dailyTokenCeiling, dailyTokens } from "./ai-budget.mjs";
import { readGate, consumeGate, gateTradingDay } from "./gate-db.mjs";
import { attachClaudeUsage, attachCliUsage, cutoffError, cutoffLine, CUTOFF_EXIT_CODE } from "./anthropic-cutoff.mjs";
import { createUsageMonitor, earlyStopLine } from "./claude-usage.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SCAN_OUT_DIR || join(here, "out");
const MAX_FAIL_RATIO = 0.2;

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error("usage: run-extract.mjs [--dry-run] [--force] [--only A,B | --symbols-file detect.json | --gate-from-db] [--agent claude|codex] [--model NAME] [--concurrency 1-3] [--timeout-s 300] [--as-of YYYY-MM-DD] [--base-url URL] [--bundle-dir DIR]");
  process.exit(msg ? 2 : 0);
}
export function parseArgs(argv) {
  const o = { dryRun: false, force: false, only: null, symbolsFile: null, gateFromDb: false, reviewCalendar: null, agent: "claude", model: null, concurrency: 1, timeoutS: 300, asOf: null, baseUrl: process.env.INGEST_BASE_URL || "http://web.invest.svc.cluster.local:3000", bundleDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`missing value for ${a}`); return argv[++i]; };
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--force") o.force = true;
    else if (a === "--only") o.only = val().split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--symbols-file") o.symbolsFile = val();
    else if (a === "--gate-from-db") o.gateFromDb = true;
    else if (a === "--review-calendar") o.reviewCalendar = val();
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
  if (o.agent === "claude" && !o.model) o.model = "haiku";
  if (o.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) usage("--as-of must be YYYY-MM-DD");
  if ([Boolean(o.only), Boolean(o.symbolsFile), o.gateFromDb, Boolean(o.reviewCalendar)].filter(Boolean).length > 1) usage("use one symbol source");
  return o;
}

/**
 * Reads the `claude -p --output-format json` envelope. The call is meant to be one turn with no tools: more than one turn,
 * or any permission denial, means the model tried a tool, and the result is rejected.
 */
export function parseClaudeEnvelope(out, requested) {
  let env;
  try { env = JSON.parse(out); } catch { throw new Error("claude output is not JSON"); }
  if (env.is_error || env.type === "error" || env.error) throw cutoffError(env) ?? attachClaudeUsage(new Error(`claude error: ${String(env.result ?? env.error?.message ?? env.subtype ?? "unknown").slice(0, 200)}`), env);
  if (Number.isInteger(env.num_turns) && env.num_turns > 1) throw attachClaudeUsage(new Error(`claude used ${env.num_turns} turns; tool use is not allowed`), env);
  if (Array.isArray(env.permission_denials) && env.permission_denials.length) throw attachClaudeUsage(new Error("claude attempted a tool call; tool use is not allowed"), env);
  const used = Object.keys(env.modelUsage ?? {});
  return { text: env.result, model: used[0] || requested || "default", usage: usageFromEnvelope(env), costUsd: typeof env.total_cost_usd === "number" ? env.total_cost_usd : null };
}

/** No web tools for claude (`--tools ""`, one turn). Codex gets a read-only sandbox in an empty temp dir: no web, but not a tool-free call. */
export async function callAgentNoTools(opts, prompt, work) {
  const timeoutMs = opts.timeoutS * 1000;
  if (opts.agent === "claude") {
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "dontAsk", "--tools", ""];
    if (opts.model) args.push("--model", opts.model);
    let out;
    try { ({ out } = await runCli("claude", args, prompt, { timeoutMs, cwd: work })); }
    catch (e) { throw cutoffError(e) ?? attachCliUsage(e); }
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
export const materialChange = (output) => output.fundamentals?.guidanceCut === true || output.fundamentals?.narrativeChanged === true || output.fundamentals?.revenueDeclining === true ||
  output.evidence?.some((e) => /restat(?:e|ement)|material weakness/i.test(e.quote ?? ""));

async function loadBundle(opts, symbol, token, asOf) {
  if (opts.bundleDir) return JSON.parse(readFileSync(join(opts.bundleDir, `${symbol}.json`), "utf8"));
  const res = await fetch(`${opts.baseUrl}/api/ingest/bundle/${symbol}?asOf=${asOf}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`bundle HTTP ${res.status}`);
  return res.json();
}

export async function loadRuntimeUniverse(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/ingest/universe`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`universe HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body.instruments)) throw new Error("invalid universe response");
  return body.instruments;
}

/** Posts one ticker as its own scan (macro=skip: no macro result here, so the daily macro finding stays). Returns true when stored. */
export async function postTicker(opts, token, { asOf, model, output }, log) {
  const payload = {
    schemaVersion: 2, runId: randomUUID(), asOf, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), runner: { name: opts.agent, model, dataMode: opts.bundleDir ? "sample" : "real" }, tickers: [output],
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

export function unknownUsageTokens(env = process.env) {
  const value = Number(env.AI_UNKNOWN_USAGE_TOKENS ?? "20000");
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("AI_UNKNOWN_USAGE_TOKENS must be a positive integer");
  return value;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let token = opts.gateFromDb || opts.reviewCalendar ? getToken() : null;
  if (opts.gateFromDb && !token) { console.error("no INGEST_TOKEN; aborting"); process.exit(2); }
  let wanted = opts.only;
  const gate = opts.symbolsFile ? JSON.parse(readFileSync(opts.symbolsFile, "utf8")) : opts.gateFromDb ? await readGate(opts.baseUrl, token, "extract") : null;
  if (gate) wanted = gate.symbols;
  if (opts.reviewCalendar) {
    if (!token) { console.error("no INGEST_TOKEN; aborting"); process.exit(2); }
    wanted = await reviewDue(opts.baseUrl, token, 30, 6);
    writeFileSync(opts.reviewCalendar, JSON.stringify({ symbols: wanted }) + "\n");
    console.error(`fixed review: ${wanted.length} symbols due`);
  }
  if (!wanted && !opts.force) usage("--gate-from-db, --review-calendar, --symbols-file or --only is required; use --force for a manual full pass");
  if (gate && !Array.isArray(wanted)) usage("symbols file must contain a symbols array");
  if (Array.isArray(wanted) && !wanted.length) { console.error("nothing changed; 0 model calls"); if (opts.gateFromDb && !opts.dryRun && !gate.consumed) await consumeGate(opts.baseUrl, token, "extract", gate.asOf, gate.revision); return; }
  if (!token && !(opts.bundleDir && opts.dryRun)) token = getToken();
  if (!token && !(opts.bundleDir && opts.dryRun)) { console.error("no INGEST_TOKEN; aborting"); process.exit(2); }
  const universe = opts.bundleDir && opts.dryRun
    ? JSON.parse(readFileSync(join(here, "universe.json"), "utf8")).instruments
    : await loadRuntimeUniverse(opts.baseUrl, token);
  const selected = wanted ? universe.filter((u) => wanted.includes(u.symbol)) : universe;
  const unknown = (wanted ?? []).filter((s) => !universe.some((u) => u.symbol === s));
  if (unknown.length) usage(`not in instruments table: ${unknown.join(", ")}`);
  if (!selected.length) { console.error("nothing to extract"); return; }
  const asOf = opts.asOf || (opts.gateFromDb ? gateTradingDay(gate.asOf) : lastUsTradingDay());
  const runId = randomUUID();
  mkdirSync(OUT, { recursive: true });
  const logFile = join(OUT, `extract-${asOf}-${runId.slice(0, 8)}.log`);
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.error(line); appendFileSync(logFile, line + "\n"); };
  log(`extract ${runId} asOf=${asOf} agent=${opts.agent} model=${opts.model || "default"} tickers=${selected.length} dryRun=${opts.dryRun} force=${opts.force} offline=${Boolean(opts.bundleDir)}`);
  // Dry runs never touch extraction_runs: an ok row without a posted scan would make the next real run skip the ticker.
  const logRuns = Boolean(token) && !opts.dryRun;
  const prompt = readFileSync(join(here, "prompts", "ticker-extract.md"), "utf8");
  const work = mkdtempSync(join(tmpdir(), "investbuddy-extract-"));
  let model = opts.model || "default";
  const failed = [], tickers = [], droppedAll = {}, skippedSymbols = [], postFailed = [], deferredSymbols = [];
  let totals = emptyUsage(), totalCost = 0, calls = 0, inputChars = 0, cutoff = null, softStop = null, ceilingStop = null, unknownLocalTokens = 0;
  const ceiling = dailyTokenCeiling();
  if (ceiling && opts.concurrency > 1) throw new Error("AI_DAILY_TOKEN_CEILING requires --concurrency 1");
  const monitor = opts.agent === "claude" && !(opts.bundleDir && opts.dryRun) && !process.env.ANTHROPIC_API_KEY ? createUsageMonitor({ baseUrl: opts.baseUrl, ingestToken: token, job: "extract", runId, log }) : null;
  if (monitor) softStop = await monitor.start();
  await pool(selected, opts.concurrency, async (u) => {
    if (cutoff || ceilingStop) return;
    const t0 = Date.now();
    let spent = emptyUsage(), hash = null, tickerModel = opts.model || "default", tickerCost = 0;
    try {
      const bundle = await withRetry(() => loadBundle(opts, u.symbol, token, asOf), log, `${u.symbol} bundle`);
      if (!bundle.documents?.length && !bundle.facts?.length) throw Object.assign(new Error("empty bundle"), { skip: true });
      hash = inputHash({ bundle, prompt, agent: opts.agent, model: opts.model });
      log(`${u.symbol}: input hash ${hash}; accessions ${(gate?.accessions?.[u.symbol] ?? []).join(",") || "none"}`);
      if (logRuns && !opts.force && await alreadyExtracted(opts.baseUrl, token, { symbol: u.symbol, agent: opts.agent, inputHash: hash })) {
        skippedSymbols.push(u.symbol);
        log(`${u.symbol}: SKIPPED same input already extracted and applied (input ${hash.slice(0, 12)}); use --force to rerun`);
        return;
      }
      if (monitor && !softStop) softStop = await monitor.check();
      if (softStop) { deferredSymbols.push(u.symbol); return; }
      const value = await withRetry(async () => {
        const text = fill(prompt, { SYMBOL: u.symbol, NAME: u.name, SECTOR: u.sector, AS_OF: asOf, BUNDLE: JSON.stringify(bundle) });
        inputChars += text.length;
        const invoke = async (model) => {
          if (ceiling) {
            const used = token ? await dailyTokens(opts.baseUrl, token) : (totals.inputTokens ?? 0) + (totals.outputTokens ?? 0) + (totals.cacheReadTokens ?? 0) + (totals.cacheCreationTokens ?? 0) + unknownLocalTokens;
            if (used >= ceiling) { ceilingStop = { used, ceiling }; throw Object.assign(new Error("daily token ceiling reached"), { exitCode: CUTOFF_EXIT_CODE }); }
          }
          const id = token ? await reserveBudget(opts.baseUrl, token, "extract", model, opts.agent) : null;
          let r, callError;
          try { r = await callAgentNoTools({ ...opts, model }, text, work); }
          catch (e) { callError = e; throw e; }
          finally {
            if (id) {
              const state = callError?.cutoff ? { status: "cutoff", resetAt: callError.cutoff.resetAt, resetHint: callError.cutoff.resetHint, window: callError.cutoff.window } : callError ? { status: "failed" } : null;
              const recorded = await finishBudget(opts.baseUrl, token, id, r?.usage ?? callError?.usage, r?.costUsd ?? callError?.costUsd, state);
              if (!recorded) log("AI ledger unavailable");
            }
          }
          if (!token && (r.usage?.inputTokens == null || r.usage?.outputTokens == null)) unknownLocalTokens += unknownUsageTokens();
          calls++; spent = addUsage(spent, r.usage); tickerCost += r.costUsd ?? 0; totalCost += r.costUsd ?? 0;
          return r;
        };
        let r = await invoke(opts.model);
        let obj = extractJson(r.text);
        if (opts.agent === "claude" && opts.model === "haiku" && materialChange(obj)) {
          log(`${u.symbol}: material change flagged; escalating to sonnet`);
          r = await invoke("sonnet");
          obj = extractJson(r.text);
        }
        if (r.model && r.model !== "default") { model = r.model; tickerModel = r.model; }
        if (obj.symbol !== u.symbol) throw new Error(`symbol mismatch: got ${obj.symbol}`);
        const checked = checkEvidence(obj, bundle, { asOf });
        const errs = validateTicker(checked.output);
        if (errs.length) throw new Error(`schema: ${errs.slice(0, 5).join("; ")}`);
        if (checked.dropped.length) droppedAll[u.symbol] = checked.dropped; else delete droppedAll[u.symbol];
        return { output: checked.output, chars: text.length };
      }, log, u.symbol);
      totals = addUsage(totals, spent);
      log(`${u.symbol}: ok in ${Math.round((Date.now() - t0) / 1000)}s, input ${value.chars} chars, tokens in/out ${spent.inputTokens ?? "?"}/${spent.outputTokens ?? "?"} (cache read ${spent.cacheReadTokens ?? "?"}, created ${spent.cacheCreationTokens ?? "?"}), turns ${spent.turns ?? "?"}, cost $${tickerCost.toFixed(4)}${droppedAll[u.symbol] ? `, ${droppedAll[u.symbol].length} claims downgraded` : ""}`);
      tickers.push(value.output);
      if (!opts.dryRun) {
        // Each result is stored as soon as it is ready, so a killed run keeps its progress and the skip key makes the rerun cheap.
        const run = { symbol: u.symbol, asOf, agent: opts.agent, model: tickerModel, inputHash: hash, accessions: gate?.accessions?.[u.symbol] ?? [], usage: spent, costUsd: tickerCost, output: value.output };
        const posted = await postTicker(opts, token, { asOf, model: tickerModel, output: value.output }, log);
        // ok is recorded only after the scan is stored, so an unapplied result is never skipped on the next run.
        await recordRun(opts.baseUrl, token, posted ? { ...run, status: "ok", applied: true } : { ...run, output: undefined, status: "failed", error: "POST /api/ingest/scan failed; result not applied", applied: false }, log);
        if (!posted) postFailed.push(u.symbol);
      }
    } catch (e) {
      totals = addUsage(totals, spent);
      if (ceilingStop) { deferredSymbols.push(u.symbol); return; }
      if (e.exitCode === CUTOFF_EXIT_CODE) { cutoff ??= e.cutoff; return; }
      log(`${u.symbol}: ${e.skip ? "SKIPPED" : "FAILED"} ${e.message}`);
      if (!e.skip || opts.gateFromDb) {
        failed.push({ symbol: u.symbol, reason: e.message });
        if (logRuns && hash) await recordRun(opts.baseUrl, token, { symbol: u.symbol, asOf, agent: opts.agent, model: tickerModel, inputHash: hash, accessions: gate?.accessions?.[u.symbol] ?? [], status: "failed", usage: spent, costUsd: tickerCost, error: e.message.slice(0, 2000), applied: false }, log);
      }
    }
  });
  if (monitor) await monitor.end();
  if (!process.env.SCAN_KEEP_WORK) rmSync(work, { recursive: true, force: true });
  if (cutoff) { log(cutoffLine(cutoff, tickers.length)); process.exit(CUTOFF_EXIT_CODE); }
  if (ceilingStop) { log(`DAILY TOKEN CEILING: ${ceilingStop.used}/${ceilingStop.ceiling} tokens after ${tickers.length} tickers; remaining work pending`); process.exit(CUTOFF_EXIT_CODE); }
  if (softStop && deferredSymbols.length) { log(earlyStopLine(softStop)); process.exit(CUTOFF_EXIT_CODE); }
  const payload = {
    schemaVersion: 2, runId, asOf, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), runner: { name: opts.agent, model, dataMode: opts.bundleDir ? "sample" : "real" }, tickers,
    macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "Macro not extracted in this script-first run; values unknown.", evidence: [], events: [] },
  };
  const errs = validatePayload(payload);
  if (errs.length) { log(`assembled payload invalid: ${errs.join("; ")}`); process.exit(1); }
  const payloadFile = join(OUT, `extract-payload-${asOf}-${opts.agent}-${runId.slice(0, 8)}.json`);
  writeFileSync(payloadFile, JSON.stringify({ ...payload, _droppedClaims: droppedAll }, null, 2) + "\n");
  log(`payload written ${payloadFile} (${tickers.length} tickers)`);
  const logTotals = () => log(`totals: ${calls} model calls, ${inputChars} input chars, tokens in ${totals.inputTokens ?? "?"} out ${totals.outputTokens ?? "?"} cache read ${totals.cacheReadTokens ?? "?"} cache created ${totals.cacheCreationTokens ?? "?"}, turns ${totals.turns ?? "?"}${totalCost ? `, cost $${totalCost.toFixed(4)}` : ""}; ok ${tickers.length}, skipped ${skippedSymbols.length}, failed ${failed.length}`);
  if (!opts.dryRun) {
    if (!tickers.length) { logTotals(); log("no valid tickers; not posting"); if (opts.gateFromDb && !failed.length) await consumeGate(opts.baseUrl, token, "extract", gate.asOf, gate.revision); process.exit(failed.length ? 1 : 0); }
    if (postFailed.length) { logTotals(); log(`not stored: ${postFailed.join(", ")}`); process.exit(3); }
  } else log("dry run: nothing posted, nothing recorded");
  logTotals();
  if (opts.gateFromDb && failed.length) { log("gate remains pending after failed extraction"); process.exit(1); }
  if (failed.length / selected.length > MAX_FAIL_RATIO) { log(`failure ratio exceeds ${MAX_FAIL_RATIO * 100}%: ${failed.map((f) => f.symbol).join(", ")}`); process.exit(1); }
  if (opts.gateFromDb && !opts.dryRun) await consumeGate(opts.baseUrl, token, "extract", gate.asOf, gate.revision);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(`fatal: ${e.stack || e.message}`); process.exit(1); });
