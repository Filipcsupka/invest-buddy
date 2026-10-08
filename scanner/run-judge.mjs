#!/usr/bin/env node
// Judge step (phase C). Fixed rules in code (src/engine/signals.ts, served by the web's judge-input route) decide the action,
// the size tier and the three setup ratings from data alone. The owner's portfolio baseline is optional: it only fills the private
// EUR band, and the model never sees it. This script sends only the symbols whose decision changed to ONE `claude -p`
// call on the subscription CLI login (no API key). The model writes the wording and may only downgrade a buy to WATCH or flag
// a conflict, each with an evidence url from the input. The script validates the JSON against scanner/schema/judge-output.schema.json,
// rejects figures that are not in the input, merges the fixed decision with the wording and posts it to /api/ingest/ideas.
// The model never writes to the database or the web. No database credentials here.
// Usage: node scanner/run-judge.mjs [--dry-run] [--force] [--model sonnet] [--as-of YYYY-MM-DD]
//        [--max-symbols 12] [--agent-mode] [--max-turns 8] [--base-url URL] [--timeout-s 300] [--input-file judge-input.json]
//   --dry-run     call the model and write the result file, post nothing, record nothing
//   --force       ignore the one-run-per-day and unchanged-input skips
//   --agent-mode  the model may read the prepared input files with Read, Grep and Glob (read-only, no web, no shell), within --max-turns and the budget
//   --input-file  offline: read the judge input from a file instead of the web
// Model default: $JUDGE_MODEL, else sonnet. In a container: command ["node", "/app/scanner/run-judge.mjs"] (the image entrypoint is run-scan.mjs).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractJson, fill, getToken, lastUsTradingDay, runCli } from "./run-scan.mjs";
import { callAgentNoTools, addUsage } from "./run-extract.mjs";
import { canonical, usageFromEnvelope } from "./extraction-log.mjs";
import { reserveBudget, finishBudget } from "./ai-budget.mjs";
import { readGate, consumeGate, gateTradingDay } from "./gate-db.mjs";
import { attachClaudeUsage, attachCliUsage, cutoffError, cutoffLine, CUTOFF_EXIT_CODE } from "./anthropic-cutoff.mjs";
import { createUsageMonitor, earlyStopLine } from "./claude-usage.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SCAN_OUT_DIR || join(here, "out");
export const BUY_ACTIONS = ["START_POSITION", "ADD", "HIGH_CONVICTION_ADD"];
const DOWNGRADABLE = BUY_ACTIONS;
const NO_EVIDENCE_OK = ["WATCH", "CSPX_ALLOCATION", "HOLD", "THESIS_BROKEN", "REDUCE"];

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error("usage: run-judge.mjs [--dry-run] [--force] [--symbols-file FILE | --gate-from-db] [--model NAME] [--as-of YYYY-MM-DD] [--max-symbols 12] [--agent-mode] [--max-turns 8] [--base-url URL] [--timeout-s 300] [--input-file FILE]");
  process.exit(msg ? 2 : 0);
}
export function parseArgs(argv, env = process.env) {
  const o = { dryRun: false, force: false, model: env.JUDGE_MODEL || "sonnet", asOf: null, baseUrl: env.INGEST_BASE_URL || "http://web.invest.svc.cluster.local:3000", timeoutS: 300, inputFile: null, symbolsFile: null, gateFromDb: false, agent: "claude", maxSymbols: 12, agentMode: false, maxTurns: 8 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`missing value for ${a}`); return argv[++i]; };
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--force") o.force = true;
    else if (a === "--agent-mode") o.agentMode = true;
    else if (a === "--model") o.model = val();
    else if (a === "--as-of") o.asOf = val();
    else if (a === "--base-url") o.baseUrl = val().replace(/\/$/, "");
    else if (a === "--timeout-s") o.timeoutS = Number(val());
    else if (a === "--max-symbols") o.maxSymbols = Number(val());
    else if (a === "--max-turns") o.maxTurns = Number(val());
    else if (a === "--input-file") o.inputFile = val();
    else if (a === "--symbols-file") o.symbolsFile = val();
    else if (a === "--gate-from-db") o.gateFromDb = true;
    else if (a === "-h" || a === "--help") usage();
    else usage(`unknown argument ${a}`);
  }
  if (!(o.timeoutS > 0)) usage("--timeout-s must be positive");
  if (!Number.isInteger(o.maxSymbols) || o.maxSymbols < 1 || o.maxSymbols > 40) usage("--max-symbols must be 1 to 40");
  if (!Number.isInteger(o.maxTurns) || o.maxTurns < 1 || o.maxTurns > 30) usage("--max-turns must be 1 to 30");
  if (!o.model) usage("--model must not be empty");
  if (o.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) usage("--as-of must be YYYY-MM-DD");
  if (o.symbolsFile && o.gateFromDb) usage("use --symbols-file or --gate-from-db");
  return o;
}

// ---------- schema check (the draft 2020-12 subset used by judge-output.schema.json) ----------
export const judgeSchema = JSON.parse(readFileSync(join(here, "schema", "judge-output.schema.json"), "utf8"));
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
function walk(s, v, path, errs, root) {
  if (s.$ref) return walk(s.$ref.slice(2).split("/").reduce((n, k) => n[k], root), v, path, errs, root);
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: must be one of ${s.enum.join(", ")}`);
  if (s.type) {
    const t = typeOf(v);
    if (!(s.type === t || (s.type === "integer" && Number.isInteger(v)))) { errs.push(`${path}: expected ${s.type}, got ${t}`); return; }
  }
  if (typeof v === "number" && !Number.isFinite(v)) errs.push(`${path}: not finite`);
  if (typeof v === "string") {
    if (s.minLength != null && v.length < s.minLength) errs.push(`${path}: shorter than ${s.minLength}`);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength}`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${path}: does not match ${s.pattern}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) errs.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => walk(s.items, x, `${path}[${i}]`, errs, root));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const k of s.required ?? []) if (!(k in v)) errs.push(`${path}.${k}: required`);
    const props = s.properties ?? {};
    for (const [k, x] of Object.entries(v)) {
      if (k in props) walk(props[k], x, `${path}.${k}`, errs, root);
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: unknown field`);
    }
  }
}
/** Models often send `"downgrade": null` for "not used". Treat null as absent; every other deviation stays a schema error. */
export function normalizeOutput(obj) {
  if (obj && Array.isArray(obj.ideas)) for (const i of obj.ideas) if (i && typeof i === "object") for (const k of ["downgrade", "conflict"]) if (i[k] === null) delete i[k];
  return obj;
}
/** Errors against the judge output schema. An empty list means the shape is valid. */
export function validateJudgeOutput(obj) {
  const errs = [];
  walk(judgeSchema, obj, "output", errs, judgeSchema);
  return errs;
}

// ---------- no invented figures ----------
// A minus counts as a sign only at the start of a figure (not in "60-90", "20-day" or "2026-10-05").
const FIGURE = /(?:(?<![\w.)])([-\u2212])(?=\d))?(\d[\d,]*(?:\.\d+)?)/g;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
/** SEC form names such as 8-K and 10-Q are labels, not figures. */
const FORM_NAME = /\b(?:6|8|10|20|40)-[KQF]\b|\b13[DFG]\b|\b(?:Form|Schedule|Items?)\s+\d+(?:\.\d+)?[A-Z]?\b/gi;
/**
 * Numbers that are part of a label, not a claimed figure: windows (200-day, 52-week, 12-month, 3-year, 10 days, 20d), moving averages (MA200, SMA50, EMA 21),
 * quarter and fiscal labels (Q3, 2Q26, FY26, fiscal 2027, H1), years after a context word, top-N, ordinals, list numbers, and the tier wording (1/3 of a full position).
 * Real figures (prices, percentages, revenue, backlog, share counts) are not matched and stay checked.
 */
const LABELS = [
  /\b\d+(?:\.\d+)?[- ]?(?:day|week|month|year|quarter|session|trading[- ]day)s?\b|\b\d+(?:\.\d+)?[- ]?(?:dňov\w*|týždňov\w*|mesačn\w*|ročn\w*)/gi,
  /\b\d+[dw]\b/gi,
  /\b[SE]?MA[- ]?\d+\b/gi,
  /\b(?:Q[1-4]|[1-4]Q|H[12])(?:[- ]?(?:FY)?\d{2,4})?\b/gi,
  /\b(?:FY|CY)[- ]?\d{2,4}\b|\bfiscal(?:\s+year)?\s+\d{2,4}\b/gi,
  /\b(?:in|since|by|during|through|until|from|for|of|to|calendar|year|between)\s+(20[0-3]\d)\b/gi,
  /\btop[- ]\d+\b/gi,
  /\b\d+(?:st|nd|rd|th)\b/gi,
  /(?:^|\n)\s*\d+[.)](?=\s)|\(\d+\)|#\d+|\b(?:step|rank|ranked|item|point|number|no\.)\s+\d+\b(?!\.\d)/gi,
  /\b(?:S&P|SP|Nasdaq|NASDAQ|Russell|Dow|DJIA|FTSE|DAX|Stoxx|STOXX)[- ]?(?:Composite\s+)?\d{2,4}\b/g,
  /\b\d+\/\d+\b|\b\d+(?:\.\d+)?\s*(?:%|percent)\s+of\s+(?:a|the)\s+(?:full\s+)?position\b/gi,
];
const stripLabels = (text) => LABELS.reduce((t, re) => t.replace(re, (m, y) => (typeof y === "string" ? m.replace(y, " ") : " ")), text);
const URL_TEXT = /https?:\/\/\S+/g;
/** Fields that hold identifiers, links or timestamps. Digits in them are not figures. */
const NON_FIGURE_KEYS = /^(url|evidenceUrl|id|runId|accession\w*|signature|ruleConfigVersion|asOf|generatedAt|publishedAt|fiscalPeriod|filedAt|date|field)$|(Url|Id|At|Date)$/;
export const figuresIn = (text) => [...String(text).replace(FORM_NAME, " ").matchAll(FIGURE)].map((m) => (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, "")));
/** Numbers in numeric fields and in free-text strings; never in URLs, dates, ids or accession numbers. */
function collect(v, key, figures, dates) {
  if (typeof v === "number") { if (Number.isFinite(v)) figures.add(v); return; }
  if (typeof v === "string") {
    for (const d of v.match(ISO_DATE) ?? []) dates.add(d);
    if (NON_FIGURE_KEYS.test(key ?? "") || /^https?:\/\//.test(v)) return;
    for (const n of figuresIn(v.replace(URL_TEXT, " ").replace(ISO_DATE, " "))) figures.add(n);
    return;
  }
  if (Array.isArray(v)) { for (const x of v) collect(x, key, figures, dates); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, k, figures, dates);
}
/** Only named rule windows and the score denominator may appear without an input figure. */
const ruleFigure = (text, value) => (value === 14 && /\bRSI\s*14\b/i.test(text)) || (value === 20 && /\b20[- ]day\b/i.test(text)) || (value === 25 && /\b(?:of|z) 25\b/i.test(text));
/** The words around the first offending figure, so a skip in the log shows what the model wrote. */
export function figureContext(texts, figure) {
  const text = texts.map(String).join(" | ");
  const needle = String(Math.abs(figure));
  const i = text.indexOf(needle);
  return i < 0 ? "no context" : text.slice(Math.max(0, i - 30), i + needle.length + 30).replace(/\s+/g, " ");
}
/** Every figure in the model's wording must occur in the input it was given. Returns the offending figures. */
export function inventedFigures(texts, inputValue) {
  const allowed = new Set(), dates = new Set();
  collect(inputValue, undefined, allowed, dates);
  const bad = [];
  for (const t of texts) {
    const text = String(t).replace(ISO_DATE, (d) => (dates.has(d) ? " " : d));
    for (const n of figuresIn(stripLabels(text))) if (!allowed.has(n) && !ruleFigure(text, Math.abs(n))) bad.push(n);
  }
  return [...new Set(bad)];
}
export const wording = (i) => [i.verdict, ...i.whatHappened, ...i.whyItMatters, ...i.numbers.flatMap((n) => [n.label, n.value]), ...i.evidence.map((e) => e.label), i.plan.trigger, i.plan.invalidation, i.plan.opportunityCost, i.downgrade?.reason, i.conflict?.reason].filter(Boolean);

// ---------- fixed decisions plus wording ----------
const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
/** Owner view only: the private EUR band as text. "EUR 0" when there is no band (no baseline, below the minimum, or not a buy). */
export const amountText = (action, min, max) => (action === "WATCH" || max === 0 ? "EUR 0" : `EUR ${money(min)}-${money(max)}`);
/** Public size wording for the model and the log: a share of a full position, never money. */
export const TIER_TEXT = {
  NONE: "no new money", STARTER: "starter, about 1/3 of a full position", STANDARD: "standard, about 2/3 of a full position", FULL: "full position",
  ADD_THIRD: "add about 1/3 of a full position", ADD_HALF: "add about 1/2 of a full position",
};

/** The signals that are news: a different signature than the last stored idea, or a new symbol with an action other than HOLD. */
export function changedSignals(signals, previous) {
  const prev = new Map((previous ?? []).map((p) => [p.symbol, p.signature]));
  return signals.filter((s) => { const before = prev.get(s.symbol); return before === undefined ? s.action !== "HOLD" : before !== s.signature; });
}

/**
 * What the model sees: the changed signals with their context, with no timestamps. Data only: no portfolio, no EUR band, no held value,
 * because the public wording must fit every reader. Cost basis is not in it.
 */
export function buildModelInput(input, news) {
  const ctx = new Map(input.symbols.map((s) => [s.symbol, s]));
  const context = (symbol) => { const c = ctx.get(symbol); if (!c) return null; const rest = { ...c }; delete rest.held; return rest; };
  return {
    asOf: input.asOf, ruleConfigVersion: input.ruleConfigVersion, benchmark: input.benchmark,
    items: news.map((s) => ({ signal: { action: s.action, sizeTier: s.sizeTier, size: TIER_TEXT[s.sizeTier] ?? null, ratings: s.ratings, unconfirmed: s.unconfirmed, carriedFrom: s.carriedFrom, reasons: s.reasons, symbol: s.symbol }, context: context(s.symbol) })),
  };
}

/**
 * Checks the model's wording against the input and merges it with the fixed decision. A problem that cannot be repaired (a missing or extra symbol,
 * an evidence url outside the input, an invented figure) throws, so the call is tried again. Nothing the model writes can change the action upward,
 * the tier, the amounts or the ratings: an unknown field is a schema error, and a downgrade only moves a buy to WATCH with tier NONE and EUR 0.
 */
export function mergeIdeas(output, news, modelInput, { collect = false } = {}) {
  const bySymbol = new Map(news.map((s) => [s.symbol, s]));
  const seen = new Set(), ideas = [], notes = [], failed = new Map();
  for (const idea of output.ideas) {
    const sig = bySymbol.get(idea.symbol);
    if (!sig) throw new Error(`idea for ${idea.symbol}, which is not an item`);
    if (seen.has(idea.symbol)) throw new Error(`second idea for ${idea.symbol}`);
    seen.add(idea.symbol);
    try { ideas.push(mergeOne(idea, sig, modelInput, notes)); } catch (e) { if (!collect) throw e; failed.set(idea.symbol, e.message.replace(`${idea.symbol}: `, "")); }
  }
  const missing = news.filter((s) => !seen.has(s.symbol)).map((s) => s.symbol);
  if (collect) for (const m of missing) failed.set(m, "no idea in the output");
  else if (missing.length) throw new Error(`no idea for ${missing.join(", ")}`);
  return { ideas, notes, failed };
}
function mergeOne(idea, sig, modelInput, notes) {
  {
    const item = modelInput.items.find((i) => i.signal.symbol === idea.symbol);
    const urls = new Set((item?.context?.evidence ?? []).map((e) => e.url));
    const bad = idea.evidence.filter((e) => !urls.has(e.url));
    if (bad.length) throw new Error(`${idea.symbol}: evidence url not in the input: ${bad[0].url}`);
    if (new Set(idea.evidence.map((e) => e.url)).size !== idea.evidence.length) throw new Error(`${idea.symbol}: duplicate evidence url`);
    // Evidence links are pointers to the stored primary sources, not a judgment. When the model cites fewer than two for a buy,
    // the script adds the labelled links from the input (earnings release, 10-Q, Form 4, SEC XBRL), so a short answer does not drop a valid signal.
    if (idea.evidence.length < 2 && !NO_EVIDENCE_OK.includes(sig.action)) {
      const have = new Set(idea.evidence.map((e) => e.url));
      const extra = (item?.context?.evidence ?? []).filter((e) => e.label && !have.has(e.url));
      for (const e of extra) { if (idea.evidence.length >= 3) break; idea.evidence.push({ url: e.url, label: e.label }); idea.sk.evidence.push({ url: e.url, label: { "Earnings release": "Výsledková správa", "SEC XBRL": "Výkaz SEC XBRL" }[e.label] ?? (/^(?:10-[KQ]|8-K|Form 4)$/.test(e.label) ? e.label : "Zdroj") }); notes.push(`${idea.symbol}: evidence link added from the input: ${e.label}`); }
    }
    if (idea.evidence.length < 2 && !NO_EVIDENCE_OK.includes(sig.action)) throw new Error(`${idea.symbol}: fewer than two evidence links for ${sig.action}`);
    for (const k of ["downgrade", "conflict"]) if (idea[k] && !urls.has(idea[k].evidenceUrl)) throw new Error(`${idea.symbol}: ${k} cites a url not in the input`);
    const figures = inventedFigures([...wording(idea), ...wording({ ...idea.sk, downgrade: { reason: idea.sk.downgradeReason }, conflict: { reason: idea.sk.conflictReason } })], { item });
    if (figures.length) throw new Error(`${idea.symbol}: figures not in the input: ${figures.slice(0, 5).join(", ")} (${figureContext(wording(idea), figures[0])})`);
    const publicWording = [...wording(idea), ...wording({ ...idea.sk, downgrade: { reason: idea.sk.downgradeReason }, conflict: { reason: idea.sk.conflictReason } })].join(" ");
    if (/\b(?:you should buy|you should sell|buy now|sell now|guaranteed return|price target|mal by si kúpiť|mal by si predať|kúp teraz|predaj teraz|garantovan\w* výnos|cieľov\w* cen\w*)\b/i.test(publicWording)) throw new Error(`${idea.symbol}: ADR-001 wording is not informational`);
    if (idea.sk.evidence.length !== idea.evidence.length || idea.sk.evidence.some((e, idx) => e.url !== idea.evidence[idx].url)) throw new Error(`${idea.symbol}: Slovak evidence URLs differ from English`);
    const sameFigures = (a, b) => JSON.stringify(figuresIn(stripLabels(String(a ?? ""))).sort((x, y) => x - y)) === JSON.stringify(figuresIn(stripLabels(String(b ?? ""))).sort((x, y) => x - y));
    if (idea.sk.whatHappened.length !== idea.whatHappened.length || idea.sk.whyItMatters.length !== idea.whyItMatters.length) throw new Error(`${idea.symbol}: Slovak bullets differ from English`);
    for (const [en, sk] of [[idea.verdict, idea.sk.verdict], ...idea.whatHappened.map((s, i) => [s, idea.sk.whatHappened[i]]), ...idea.whyItMatters.map((s, i) => [s, idea.sk.whyItMatters[i]]), ...["trigger", "invalidation", "opportunityCost"].map((key) => [idea.plan[key], idea.sk.plan[key]]), ...idea.evidence.map((e, i) => [e.label, idea.sk.evidence[i].label]), [idea.downgrade?.reason, idea.sk.downgradeReason], [idea.conflict?.reason, idea.sk.conflictReason]]) {
      if (!sameFigures(en, sk)) throw new Error(`${idea.symbol}: Slovak prose figures differ from English`);
    }
    if (idea.sk.numbers.length !== idea.numbers.length) throw new Error(`${idea.symbol}: Slovak numbers differ from English`);
    for (let idx = 0; idx < idea.numbers.length; idx++) {
      const en = idea.numbers[idx], sk = idea.sk.numbers[idx];
      if (!sameFigures(en.label, sk.label) || !sameFigures(en.value, sk.value)) throw new Error(`${idea.symbol}: Slovak numbers differ from English`);
    }
    if (Boolean(idea.downgrade) !== Boolean(idea.sk.downgradeReason) || Boolean(idea.conflict) !== Boolean(idea.sk.conflictReason)) throw new Error(`${idea.symbol}: Slovak reasons differ from English`);
    let { action, sizeTier, amountMinEur: min, amountMaxEur: max } = sig;
    let downgradedFrom = null;
    if (idea.downgrade) {
      if (DOWNGRADABLE.includes(action)) { downgradedFrom = action; action = "WATCH"; sizeTier = "NONE"; min = 0; max = 0; }
      else notes.push(`${idea.symbol}: downgrade ignored, ${action} is not a buy`);
    }
    return {
      symbol: idea.symbol, action, sizeTier, amountMinEur: min, amountMaxEur: max, verdict: idea.verdict, whatHappened: idea.whatHappened, whyItMatters: idea.whyItMatters,
      setup: sig.ratings, numbers: idea.numbers, plan: { amountNow: amountText(action, min, max), ...idea.plan }, evidence: idea.evidence,
      unconfirmed: sig.unconfirmed || idea.unconfirmed || downgradedFrom !== null, carriedFrom: sig.carriedFrom ?? null, signature: sig.signature, ruleConfigVersion: sig.ruleConfigVersion,
      conflictNote: idea.conflict?.reason ?? null, downgradedFrom,
      translations: { en: { downgradeReason: idea.downgrade?.reason ?? null }, sk: { ...idea.sk, plan: { amountNow: amountText(action, min, max), ...idea.sk.plan }, conflictNote: idea.sk.conflictReason ?? null } },
    };
  }
}

/** Hash of what the model decides from: the input without generatedAt and previousIdeas (the rule version is inside it), plus prompt, schema, agent, model and mode. Same hash, same stored result, so the run is skipped. */
export function judgeHash({ input, prompt, model, agent = "claude", agentMode = false }) {
  const rest = { ...input };
  delete rest.generatedAt;
  delete rest.previousIdeas;
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  return sha(canonical({ input: rest, prompt: sha(prompt), schema: sha(canonical(judgeSchema)), agent, model: model || "default", agentMode }));
}

// ---------- agent mode: read-only file tools over a prepared directory ----------
export const READ_ONLY_TOOLS = "Read,Grep,Glob";
export function parseAgentEnvelope(out, requested, maxTurns) {
  let env;
  try { env = JSON.parse(out); } catch { throw new Error("claude output is not JSON"); }
  if (env.is_error || env.type === "error" || env.error) throw cutoffError(env) ?? attachClaudeUsage(new Error(`claude error: ${String(env.result ?? env.error?.message ?? env.subtype ?? "unknown").slice(0, 200)}`), env);
  if (Number.isInteger(env.num_turns) && env.num_turns > maxTurns) throw attachClaudeUsage(new Error(`claude used ${env.num_turns} turns; the cap is ${maxTurns}`), env);
  if (Array.isArray(env.permission_denials) && env.permission_denials.length) throw attachClaudeUsage(new Error("claude attempted a tool that is not allowed"), env);
  return { text: env.result, model: Object.keys(env.modelUsage ?? {})[0] || requested || "default", usage: usageFromEnvelope(env), costUsd: typeof env.total_cost_usd === "number" ? env.total_cost_usd : null };
}
export function agentModeArgs(o) {
  return ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "dontAsk", "--tools", READ_ONLY_TOOLS, "--allowedTools", READ_ONLY_TOOLS, "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch", "--model", o.model];
}
/** Writes the input files the agent may read: facts, technicals, ideas history, signals. No portfolio file: the wording is data only. Returns the file names. */
export function writeAgentFiles(dir, input, modelInput) {
  const items = modelInput.items;
  const files = {
    "facts.json": items.map((i) => ({ symbol: i.signal.symbol, score: i.context?.score, fields: i.context?.fields, expiredFields: i.context?.expiredFields, evidence: i.context?.evidence })),
    "technicals.json": items.map((i) => ({ symbol: i.signal.symbol, technicals: i.context?.technicals ?? null })),
    "ideas-history.json": (input.previousIdeas ?? []).map((p) => ({ symbol: p.symbol, asOf: p.asOf, action: p.action, setup: p.setup, sizeTier: p.sizeTier ?? null })),
    "signals.json": items.map((i) => i.signal),
  };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(value, null, 1));
  return Object.keys(files);
}
async function callAgentReadOnly(o, prompt, work) {
  let out;
  try { ({ out } = await runCli("claude", agentModeArgs(o), prompt, { timeoutMs: o.timeoutS * 1000, cwd: work })); }
  catch (e) { throw cutoffError(e) ?? attachCliUsage(e); }
  return parseAgentEnvelope(out, o.model, o.maxTurns);
}

// ---------- web calls ----------
async function web(baseUrl, token, path, init = {}) {
  const res = await fetch(`${baseUrl}/api/ingest/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} HTTP ${res.status}`);
  return res.json();
}
const loadInput = (o, token, asOf, gate) => (o.inputFile ? JSON.parse(readFileSync(o.inputFile, "utf8")) : web(o.baseUrl, token, `judge-input?${new URLSearchParams({ asOf, maxSymbols: String(o.maxSymbols), ...(gate ? { symbols: gate.symbols.join(",") } : {}) })}`));
const checkSkip = async (o, token, params) => (await web(o.baseUrl, token, `ideas?${new URLSearchParams({ agent: o.agent, ...params })}`)).skip === true;
const postRun = (o, token, body) => web(o.baseUrl, token, "ideas", { method: "POST", body: JSON.stringify(body) });

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let asOf = o.asOf || lastUsTradingDay();
  const offline = Boolean(o.inputFile) && o.dryRun && !o.gateFromDb;
  let token = o.gateFromDb ? getToken() : null;
  const gate = o.symbolsFile ? JSON.parse(readFileSync(o.symbolsFile, "utf8")) : o.gateFromDb ? await readGate(o.baseUrl, token, "judge") : null;
  if (o.gateFromDb && !o.asOf) asOf = gateTradingDay(gate.asOf);
  const runId = randomUUID();
  mkdirSync(OUT, { recursive: true });
  const logFile = join(OUT, `judge-${asOf}-${runId.slice(0, 8)}.log`);
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.error(line); appendFileSync(logFile, line + "\n"); };
  log(`judge ${runId} asOf=${asOf} model=${o.model} mode=${o.agentMode ? `agent(max ${o.maxTurns} turns)` : "single call, no tools"} maxSymbols=${o.maxSymbols} dryRun=${o.dryRun} force=${o.force} offline=${Boolean(o.inputFile)}`);
  if (!gate && !o.force) { log("--gate-from-db or --symbols-file is required; use --force for a manual scheduled review"); process.exit(2); }
  if (gate && !Array.isArray(gate.symbols)) { log("symbols file must contain a symbols array"); process.exit(2); }
  if (gate && !gate.symbols.length) { log("nothing changed; 0 model calls"); if (o.gateFromDb && !o.dryRun && !gate.consumed) await consumeGate(o.baseUrl, token, "judge", gate.asOf, gate.revision); return; }
  if (!token && !offline) token = getToken();
  if (!token && !offline) { log("no INGEST_TOKEN; aborting"); process.exit(2); }
  const record = Boolean(token) && !o.dryRun;

  const input = await loadInput(o, token, asOf, gate);
  if (!input.portfolio) log("no portfolio baseline: signals come from data alone; owner EUR bands stay 0");
  const gatedSignals = (input.signals ?? []).filter((s) => !gate || gate.symbols.includes(s.symbol));
  const news = o.force ? gatedSignals : changedSignals(gatedSignals, input.previousIdeas);
  log(`signals ${input.signals?.length ?? 0} (rules ${input.ruleConfigVersion}), changed ${news.length}${news.length ? `: ${news.map((s) => `${s.symbol} ${s.action} ${s.sizeTier}`).join(", ")}` : ""}`);
  if (!news.length) { log("no signal changed since the last stored idea; no model call"); if (o.gateFromDb && !o.dryRun) await consumeGate(o.baseUrl, token, "judge", gate.asOf, gate.revision); return; }
  const prompt = readFileSync(join(here, "prompts", "judge.md"), "utf8");
  const hash = judgeHash({ input, prompt, model: o.model, agent: o.agent, agentMode: o.agentMode });
  log(`judge input hash ${hash}; gate accessions ${JSON.stringify(gate?.accessions ?? {})}`);
  if (record && !o.force && !o.gateFromDb && await checkSkip(o, token, { asOf, inputHash: hash })) { log(`SKIPPED same input already judged and stored (input ${hash.slice(0, 12)}); use --force to rerun`); return; }

  const modelInput = buildModelInput(input, news);
  const work = mkdtempSync(join(tmpdir(), "investbuddy-judge-"));
  let promptInput = modelInput;
  if (o.agentMode) {
    const files = writeAgentFiles(work, input, modelInput);
    promptInput = { asOf: modelInput.asOf, ruleConfigVersion: modelInput.ruleConfigVersion, benchmark: modelInput.benchmark, files, signals: modelInput.items.map((i) => i.signal), note: "Read the files in the current directory for the facts, technicals and history." };
  }
  const textFor = (items) => {
    const pi = o.agentMode ? { ...promptInput, signals: items.map((i) => i.signal) } : { ...promptInput, items };
    return fill(prompt, { AS_OF: asOf, INPUT: JSON.stringify(pi) });
  };
  let text = textFor(modelInput.items);
  let spent = addUsage({}, {}), cost = 0, calls = 0, model = o.model, rawOutput = null, error = null, cutoff = null, softStop = null;
  const monitor = !offline && !process.env.ANTHROPIC_API_KEY ? createUsageMonitor({ baseUrl: o.baseUrl, ingestToken: token, job: "judge", runId, log }) : null;
  if (monitor) softStop = await monitor.start();
  const good = new Map(), skipped = new Map(), notes = [];
  let pending = news;
  const t0 = Date.now();
  // At most two calls. A symbol whose wording still fails after the second call is skipped; the retry only asks for the symbols that failed.
  for (let attempt = 1; attempt <= 2 && pending.length; attempt++) {
    if (softStop) break;
    if (monitor) softStop = await monitor.check();
    if (softStop) break;
    try {
      const sub = { ...modelInput, items: modelInput.items.filter((i) => pending.some((s) => s.symbol === i.signal.symbol)) };
      text = textFor(sub.items);
      const budgetId = token ? await reserveBudget(o.baseUrl, token, "judge", o.model) : null;
      let r, callError;
      try { r = o.agentMode ? await callAgentReadOnly(o, text, work) : await callAgentNoTools({ agent: "claude", model: o.model, timeoutS: o.timeoutS }, text, work); }
      catch (e) { callError = e; throw e; }
      finally {
        if (budgetId) {
          const state = callError?.cutoff ? { status: "cutoff", resetAt: callError.cutoff.resetAt, resetHint: callError.cutoff.resetHint, window: callError.cutoff.window } : callError ? { status: "failed" } : null;
          const recorded = await finishBudget(o.baseUrl, token, budgetId, r?.usage ?? callError?.usage, r?.costUsd ?? callError?.costUsd, state);
          if (!recorded) log("AI ledger unavailable");
        }
      }
      calls++; spent = addUsage(spent, r.usage); cost += r.costUsd ?? 0; if (r.model) model = r.model;
      const out = normalizeOutput(extractJson(r.text));
      const errs = validateJudgeOutput(out);
      if (errs.length) throw new Error(`schema: ${errs.slice(0, 5).join("; ")}`);
      const merged = mergeIdeas(out, pending, sub, { collect: true });
      rawOutput = { ...out, ideas: [...(rawOutput?.ideas ?? []), ...out.ideas.filter((i) => !merged.failed.has(i.symbol))] };
      for (const i of merged.ideas) good.set(i.symbol, i);
      notes.push(...merged.notes);
      for (const [sym, why] of merged.failed) log(`attempt ${attempt}: ${sym} failed: ${why}`);
      pending = pending.filter((s) => merged.failed.has(s.symbol));
      if (pending.length) error = pending.map((s) => `${s.symbol}: ${merged.failed.get(s.symbol)}`).join("; ");
      for (const s of pending) skipped.set(s.symbol, merged.failed.get(s.symbol));
    } catch (e) {
      if (e.exitCode === CUTOFF_EXIT_CODE) { cutoff = e.cutoff; break; }
      error = e.message;
      log(`attempt ${attempt} failed: ${e.message}`);
    }
  }
  if (monitor) await monitor.end();
  for (const s of pending) if (!skipped.has(s.symbol)) skipped.set(s.symbol, error ?? "no result");
  for (const s of news) if (good.has(s.symbol)) skipped.delete(s.symbol);
  const result = good.size ? { ideas: news.filter((s) => good.has(s.symbol)).map((s) => good.get(s.symbol)), notes } : null;
  if (result) for (const [sym, why] of skipped) log(`SKIPPED ${sym}: ${why}`);
  if (!process.env.SCAN_KEEP_WORK) rmSync(work, { recursive: true, force: true });
  if (cutoff) { log(cutoffLine(cutoff, 0)); process.exit(CUTOFF_EXIT_CODE); }
  if (softStop) { log(earlyStopLine(softStop)); process.exit(CUTOFF_EXIT_CODE); }
  const secs = Math.round((Date.now() - t0) / 1000);
  const totals = `${calls} model call(s), ${text.length} input chars, tokens in ${spent.inputTokens ?? "?"} out ${spent.outputTokens ?? "?"} cache read ${spent.cacheReadTokens ?? "?"} cache created ${spent.cacheCreationTokens ?? "?"}, turns ${spent.turns ?? "?"}${cost ? `, cost $${cost.toFixed(4)}` : ""}, ${secs}s${skipped.size ? `; skipped ${[...skipped.keys()].join(", ")}` : ""}`;
  const runBase = { asOf, runId, agent: o.agent, model, inputHash: hash, usage: spent, costUsd: cost || null, ruleConfigVersion: input.ruleConfigVersion };
  if (!result) {
    log(`FAILED ${error}; ${totals}`);
    if (record) await postRun(o, token, { run: { ...runBase, status: "failed", error: String(error).slice(0, 2000), ideaCount: 0 }, ideas: [] }).catch((e) => log(`could not record run: ${e.message}`));
    process.exit(1);
  }
  for (const n of result.notes) log(n);
  const downgraded = result.ideas.filter((i) => i.downgradedFrom).length, conflicts = result.ideas.filter((i) => i.conflictNote).length;
  log(`ideas: ${result.ideas.length} from ${news.length} changed signals, ${downgraded} downgraded, ${conflicts} conflict flags${skipped.size ? `; skipped ${[...skipped.keys()].join(", ")}` : ""}`);
  const file = join(OUT, `judge-payload-${asOf}-${runId.slice(0, 8)}.json`);
  writeFileSync(file, JSON.stringify({ run: { ...runBase, status: "ok", ideaCount: result.ideas.length }, ideas: result.ideas, notes: rawOutput.notes ?? null }, null, 2) + "\n");
  log(`payload written ${file}`);
  if (o.dryRun) { log(`dry run: nothing posted, nothing recorded; ${totals}`); return; }
  try {
    const res = await postRun(o, token, { run: { ...runBase, status: "ok", ideaCount: result.ideas.length, output: rawOutput }, ideas: result.ideas });
    log(`POST ok: ${JSON.stringify(res)}; ${totals}`);
    if (o.gateFromDb && !skipped.size) await consumeGate(o.baseUrl, token, "judge", gate.asOf, gate.revision);
    if (o.gateFromDb && skipped.size) { log("gate remains pending after partial judgement"); process.exitCode = 1; }
  } catch (e) { log(`POST failed: ${e.message}; ${totals}`); process.exit(3); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(`fatal: ${e.stack || e.message}`); process.exit(1); });
