/**
 * RS0: types and a pure validator for the research engine output (scanner/schema/research-output.schema.json).
 * The runner writes `run`, the model writes `output`. The output carries facts with cited quotes only: no points, ratings,
 * actions or amounts. Points come from the deterministic engine, amounts from the owner sizing code (docs/research-engine.md).
 *
 * Validation follows the approach of scanner/validate.mjs and scanner/run-judge.mjs: a dependency-free walk over the draft 2020-12
 * subset used by the schema file, then the contract rules that a schema cannot express. An empty list means the output is valid.
 */
import schemaJson from "../../scanner/schema/research-output.schema.json";

export const RESEARCH_SCHEMA_VERSION = 1;
export const RUN_TYPES = ["weekly_discovery", "daily_watch", "deep_dive"] as const;
export type RunType = (typeof RUN_TYPES)[number];
export const ADAPTERS = ["claude", "codex"] as const;
export type AdapterName = (typeof ADAPTERS)[number];
export const AUTH_SOURCES = ["subscription", "api", "codex"] as const;
export type AuthSource = (typeof AUTH_SOURCES)[number];
export const RUN_STATUSES = ["ok", "partial", "cutoff", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const FINDING_KINDS = [
  "earnings", "guidance", "contract", "regulatory", "clinical", "product", "partnership", "capex", "m_and_a", "capital_allocation",
  "insider", "narrative", "supply_chain", "unusual_move", "risk", "macro_release",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];
/**
 * P9: a `macro_release` finding states the consensus and the actual value of one named US release. It is owner context only:
 * it never feeds a score input, a candidate or a chain. `symbol` is the reserved MACRO_SYMBOL and `companyName` the release name.
 */
export const MACRO_SYMBOL = "MACRO";
export const MACRO_RELEASES = [
  "CPI", "Core CPI", "PPI", "Core PPI", "Nonfarm payrolls", "Unemployment rate", "Average hourly earnings", "FOMC rate decision",
  "PCE", "Core PCE", "GDP", "Retail sales", "Initial jobless claims", "ISM manufacturing", "ISM services",
] as const;
export type MacroRelease = (typeof MACRO_RELEASES)[number];
/** Figure labels a `macro_release` finding may carry. `consensus` and `actual` are required, once each. */
export const MACRO_FIGURE_LABELS = ["consensus", "actual", "prior"] as const;
/** Score inputs a verified research fact may inform. The engine still decides every point. */
export const SCORE_FIELDS = ["productCatalyst", "guidanceRaised", "guidanceCut", "narrativeChanged"] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];
export const POLARITIES = ["positive", "negative", "neutral"] as const;
export type Polarity = (typeof POLARITIES)[number];
export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];
/** Source class. The model gives a hint; the verifier (RS2) decides the stored class from the host. Social is a lead only. */
export const SOURCE_CLASSES = ["primary", "press", "aggregator", "social"] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];
export const CHAIN_RELATIONS = ["partner", "supplier", "customer", "infrastructure", "competitor", "indirect"] as const;
export type ChainRelation = (typeof CHAIN_RELATIONS)[number];
export const CHAIN_OUTCOMES = ["winner", "loser", "unclear"] as const;
export type ChainOutcome = (typeof CHAIN_OUTCOMES)[number];

/** Verifier result per finding (RS2, src/research/verify.ts). Stored in research_findings.verification_status. */
export const VERIFICATION_STATUSES = ["pending", "verified", "quote_not_found", "fetch_failed", "blocked", "stale", "lead_only"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
/** The label every verified row carries: one model read the page, code checked the quote is on it. */
export const READING_LABEL = "one model reading checked against the quote";

/** Candidate pipeline states (RS3). Transitions are in docs/research-engine.md, section "Candidate pipeline". */
export const PIPELINE_STATES = ["DISCOVERED", "WATCH", "START_READY", "ADD_READY", "HOLD", "REDUCE", "BROKEN", "DROPPED"] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

export interface ResearchRun {
  runId: string;
  runType: RunType;
  asOf: string;
  generatedAt: string;
  promptVersion: string;
  adapter: { name: AdapterName; model: string; authSource: AuthSource };
  scope: { themes: string[]; symbols: string[]; deepDiveSymbol: string | null };
  limits: { maxTurns: number; maxSearches: number; maxFetches: number; maxFindings: number; timeoutS: number };
  usage: {
    inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheCreationTokens: number | null;
    webSearches: number | null; webFetches: number | null; costUsd: number | null; durationS: number | null;
  };
  status: RunStatus;
  stopReason: string | null;
}

export interface ResearchEvidence {
  url: string;
  /** Copied verbatim from the page. The verifier checks it against the fetched text. */
  quote: string;
  publishedAt: string | null;
  sourceName: string;
  sourceClassHint: SourceClass;
}

export interface ResearchFigure {
  label: string;
  /** The figure only. Every number in it must appear in the quote of evidence[evidenceIndex]. */
  value: string;
  evidenceIndex: number;
}

export interface ResearchFinding {
  id: string;
  symbol: string;
  companyName: string;
  exchange: string | null;
  kind: FindingKind;
  field: ScoreField | null;
  polarity: Polarity;
  /** Our short fact in our own words. The only finding text that may be displayed. */
  claim: string;
  eventDate: string | null;
  themes: string[];
  evidence: ResearchEvidence[];
  figures: ResearchFigure[];
  confidence: Confidence;
  /** True for a lead the model could not tie to a primary or press source. A lead never feeds a score input. */
  lead: boolean;
}

export interface ResearchCardLine { text: string; findingIds: string[] }

export interface ResearchCandidate {
  symbol: string;
  companyName: string;
  exchange: string | null;
  themes: string[];
  thesis: string;
  findingIds: string[];
  upgradeTriggers: string[];
  invalidation: string[];
  card: { verdict: string; whatHappened: ResearchCardLine[]; whyItMatters: ResearchCardLine[]; opportunityCost: string | null };
}

export interface ResearchChainLink { symbol: string; companyName: string; relation: ChainRelation; outcome: ChainOutcome; findingIds: string[] }

export interface ResearchChain {
  id: string;
  development: string;
  developmentFindingId: string;
  spendingPool: string;
  links: ResearchChainLink[];
}

/** What the model writes. Every property is required (optional ones are nullable), so the same shape works as a strict output schema. */
export interface ResearchModelOutput {
  findings: ResearchFinding[];
  candidates: ResearchCandidate[];
  chains: ResearchChain[];
  notes: string | null;
}

export interface ResearchOutput {
  schemaVersion: typeof RESEARCH_SCHEMA_VERSION;
  run: ResearchRun;
  output: ResearchModelOutput;
}

// ---------- schema walk (the draft 2020-12 subset used by research-output.schema.json) ----------

export interface JsonSchema {
  $schema?: string;
  title?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
}

/** Keywords the walker understands. A schema change that uses any other keyword must extend the walker first (tested). */
export const SUPPORTED_KEYWORDS: readonly string[] = [
  "$schema", "title", "$ref", "$defs", "type", "const", "enum", "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
  "minItems", "maxItems", "items", "required", "properties", "additionalProperties",
];

export const researchSchema = schemaJson as unknown as JsonSchema;

const FORMATS: Record<string, (s: string) => boolean> = {
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s,
  "date-time": (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
};

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number" && Number.isInteger(v)) return "integer";
  return typeof v;
}
const typeOk = (t: string, v: unknown) => t === typeOf(v) || (t === "number" && typeOf(v) === "integer");

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
  let node: unknown = root;
  for (const key of ref.slice(2).split("/")) {
    node = node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
    if (node === undefined) throw new Error(`unresolved $ref ${ref}`);
  }
  return node as JsonSchema;
}

function walk(s: JsonSchema, v: unknown, path: string, errs: string[], root: JsonSchema): void {
  if (s.$ref) return walk(resolveRef(s.$ref, root), v, path, errs, root);
  if ("const" in s && v !== s.const) errs.push(`${path}: must equal ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: must be one of ${s.enum.map((x) => String(x)).join(", ")}`);
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeOk(t, v))) { errs.push(`${path}: expected ${types.join("|")}, got ${typeOf(v)}`); return; }
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) errs.push(`${path}: not finite`);
    if (s.minimum != null && v < s.minimum) errs.push(`${path}: below ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) errs.push(`${path}: above ${s.maximum}`);
  }
  if (typeof v === "string") {
    if (s.minLength != null && v.length < s.minLength) errs.push(`${path}: shorter than ${s.minLength}`);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength}`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${path}: does not match ${s.pattern}`);
    const format = s.format ? FORMATS[s.format] : undefined;
    if (format && !format(v)) errs.push(`${path}: not a valid ${s.format}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) errs.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => walk(s.items as JsonSchema, x, `${path}[${i}]`, errs, root));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in obj)) errs.push(`${path}.${k}: required`);
    const props = s.properties ?? {};
    for (const [k, x] of Object.entries(obj)) {
      if (k in props) walk(props[k], x, `${path}.${k}`, errs, root);
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: unknown field`);
    }
  }
}

/** Shape errors only, against the schema file. */
export function schemaErrors(value: unknown, schema: JsonSchema = researchSchema): string[] {
  const errs: string[] = [];
  walk(schema, value, "$", errs, schema);
  return errs;
}

// ---------- contract rules the schema cannot express ----------

/**
 * Advice, rating and score wording the model must not write (ADR-001, docs/wording-gate.md). The model states facts;
 * actions come from the engine and amounts from the owner sizing code.
 */
export const ADVICE_PATTERN =
  /\b(?:you should|we recommend|recommend(?:ed|s)? (?:buying|selling)|strong buy|buy rating|sell rating|start (?:a |the )?position|add to (?:a |the |your )?position|high[- ]conviction|take profits?|price target|stop[- ]loss|START_POSITION|HIGH_CONVICTION_ADD|THESIS_BROKEN|CSPX_ALLOCATION|START_READY|ADD_READY)\b|\b\d+\s*(?:\/\s*25|of\s+25)\s*(?:points?|pts)\b/i;

const FIELD_KINDS: Record<ScoreField, readonly FindingKind[]> = {
  productCatalyst: ["product", "contract", "regulatory", "clinical", "partnership"],
  guidanceRaised: ["guidance"],
  guidanceCut: ["guidance"],
  narrativeChanged: ["narrative"],
};
const FIELD_POLARITY: Partial<Record<ScoreField, Polarity>> = { guidanceRaised: "positive", guidanceCut: "negative" };

/** Number tokens with thousands separators removed and leading zeros dropped: "USD 1,250M" gives ["1250"]. */
export function numberTokens(text: string): string[] {
  const joined = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  return (joined.match(/\d+(?:\.\d+)?/g) ?? []).map((t) => t.replace(/^0+(?=\d)/, ""));
}

/**
 * Rules for a `macro_release` finding. Every evidence quote must hold both the consensus and the actual number, so a single
 * quote the verifier finds on its page proves both values. No quote with both numbers means no finding.
 */
function macroErrors(f: ResearchFinding, at: string, asOf: string): string[] {
  const errs: string[] = [];
  if (f.symbol !== MACRO_SYMBOL) errs.push(`${at}.symbol: a macro_release finding uses ${MACRO_SYMBOL}`);
  if (!(MACRO_RELEASES as readonly string[]).includes(f.companyName)) errs.push(`${at}.companyName: must name a release: ${MACRO_RELEASES.join(", ")}`);
  if (f.exchange !== null) errs.push(`${at}.exchange: a macro_release finding has none`);
  if (f.field !== null) errs.push(`${at}.field: a macro_release finding never feeds a score input`);
  if (f.polarity !== "neutral") errs.push(`${at}.polarity: a macro_release finding is neutral`);
  if (f.eventDate === null) errs.push(`${at}.eventDate: the release date is required`);
  else if (f.eventDate > asOf) errs.push(`${at}.eventDate: release after the run date ${asOf}`);
  f.figures.forEach((g, j) => {
    if (!(MACRO_FIGURE_LABELS as readonly string[]).includes(g.label)) errs.push(`${at}.figures[${j}].label: must be one of ${MACRO_FIGURE_LABELS.join(", ")}`);
  });
  for (const label of ["consensus", "actual"] as const) {
    const hits = f.figures.filter((g) => g.label === label);
    if (hits.length !== 1) { errs.push(`${at}.figures: needs exactly one ${label} figure`); continue; }
    const wanted = numberTokens(hits[0].value);
    f.evidence.forEach((e, j) => {
      const have = new Set(numberTokens(e.quote));
      const missing = wanted.filter((t) => !have.has(t));
      if (missing.length) errs.push(`${at}.evidence[${j}].quote: ${label} ${missing.join(", ")} not in this quote`);
    });
  }
  return errs;
}

function contractErrors(o: ResearchOutput): string[] {
  const errs: string[] = [];
  const { run, output } = o;

  if (run.runType === "deep_dive" && run.scope.deepDiveSymbol === null) errs.push("$.run.scope.deepDiveSymbol: required for a deep_dive run");
  if (run.runType !== "deep_dive" && run.scope.deepDiveSymbol !== null) errs.push("$.run.scope.deepDiveSymbol: only a deep_dive run names one");
  if (run.runType === "weekly_discovery" && run.scope.themes.length === 0) errs.push("$.run.scope.themes: a weekly_discovery run needs at least one theme");
  if (output.findings.length > run.limits.maxFindings) errs.push(`$.output.findings: ${output.findings.length} findings over the run limit ${run.limits.maxFindings}`);

  const findings = new Map<string, ResearchFinding>();
  output.findings.forEach((f, i) => {
    const at = `$.output.findings[${i}]`;
    if (findings.has(f.id)) errs.push(`${at}.id: duplicate ${f.id}`);
    findings.set(f.id, f);
    if (f.kind === "macro_release") errs.push(...macroErrors(f, at, run.asOf));
    else if (f.symbol === MACRO_SYMBOL) errs.push(`${at}.symbol: ${MACRO_SYMBOL} is reserved for macro_release findings`);
    if (f.evidence.every((e) => e.sourceClassHint === "social") && !f.lead) errs.push(`${at}.lead: a finding with only social sources must be a lead`);
    if (f.lead && f.field !== null) errs.push(`${at}.field: a lead never feeds a score input`);
    if (f.field !== null) {
      if (!FIELD_KINDS[f.field].includes(f.kind)) errs.push(`${at}.field: ${f.field} does not fit kind ${f.kind}`);
      const polarity = FIELD_POLARITY[f.field];
      if (polarity && f.polarity !== polarity) errs.push(`${at}.polarity: ${f.field} needs ${polarity}`);
    }
    f.evidence.forEach((e, j) => {
      if (e.publishedAt !== null && e.publishedAt > run.asOf) errs.push(`${at}.evidence[${j}].publishedAt: after the run date ${run.asOf}`);
    });
    f.figures.forEach((g, j) => {
      const ev = f.evidence[g.evidenceIndex];
      if (!ev) { errs.push(`${at}.figures[${j}].evidenceIndex: no evidence item ${g.evidenceIndex}`); return; }
      const wanted = numberTokens(g.value);
      if (wanted.length === 0) { errs.push(`${at}.figures[${j}].value: has no number`); return; }
      const have = new Set(numberTokens(ev.quote));
      const missing = wanted.filter((t) => !have.has(t));
      if (missing.length) errs.push(`${at}.figures[${j}].value: ${missing.join(", ")} not in the quote of evidence ${g.evidenceIndex}`);
    });
  });

  const known = (id: string, at: string) => {
    const f = findings.get(id);
    if (!f) errs.push(`${at}: unknown finding ${id}`);
    else if (f.kind === "macro_release") errs.push(`${at}: macro_release finding ${id} is owner context only and cannot be cited`);
  };

  const symbols = new Set<string>();
  output.candidates.forEach((c, i) => {
    const at = `$.output.candidates[${i}]`;
    if (symbols.has(c.symbol)) errs.push(`${at}.symbol: duplicate ${c.symbol}`);
    symbols.add(c.symbol);
    c.findingIds.forEach((id, j) => known(id, `${at}.findingIds[${j}]`));
    if (!c.findingIds.some((id) => findings.get(id)?.symbol === c.symbol)) errs.push(`${at}.findingIds: no finding about ${c.symbol}`);
    if (c.findingIds.every((id) => findings.get(id)?.lead !== false)) errs.push(`${at}.findingIds: a candidate needs at least one finding that is not a lead`);
    [...c.card.whatHappened, ...c.card.whyItMatters].forEach((line, j) => line.findingIds.forEach((id, k) => known(id, `${at}.card line ${j} findingIds[${k}]`)));
  });

  const chainIds = new Set<string>();
  output.chains.forEach((c, i) => {
    const at = `$.output.chains[${i}]`;
    if (chainIds.has(c.id)) errs.push(`${at}.id: duplicate ${c.id}`);
    chainIds.add(c.id);
    known(c.developmentFindingId, `${at}.developmentFindingId`);
    c.links.forEach((l, j) => {
      l.findingIds.forEach((id, k) => known(id, `${at}.links[${j}].findingIds[${k}]`));
      if (l.findingIds.every((id) => findings.get(id)?.lead !== false)) errs.push(`${at}.links[${j}]: a relationship needs a finding that is not a lead`);
    });
  });

  const texts: [string, string][] = [];
  output.findings.forEach((f, i) => texts.push([`$.output.findings[${i}].claim`, f.claim]));
  output.candidates.forEach((c, i) => {
    const at = `$.output.candidates[${i}]`;
    texts.push([`${at}.thesis`, c.thesis], [`${at}.card.verdict`, c.card.verdict]);
    c.upgradeTriggers.forEach((t, j) => texts.push([`${at}.upgradeTriggers[${j}]`, t]));
    c.invalidation.forEach((t, j) => texts.push([`${at}.invalidation[${j}]`, t]));
    c.card.whatHappened.forEach((l, j) => texts.push([`${at}.card.whatHappened[${j}]`, l.text]));
    c.card.whyItMatters.forEach((l, j) => texts.push([`${at}.card.whyItMatters[${j}]`, l.text]));
    if (c.card.opportunityCost !== null) texts.push([`${at}.card.opportunityCost`, c.card.opportunityCost]);
  });
  output.chains.forEach((c, i) => texts.push([`$.output.chains[${i}].development`, c.development], [`$.output.chains[${i}].spendingPool`, c.spendingPool]));
  if (output.notes !== null) texts.push(["$.output.notes", output.notes]);
  for (const [at, text] of texts) {
    const hit = text.match(ADVICE_PATTERN);
    if (hit) errs.push(`${at}: advice or score wording "${hit[0]}"`);
  }
  return errs;
}

/** All errors: shape first, then the contract rules (only on a valid shape). An empty list means valid. */
export function validateResearchOutput(value: unknown): string[] {
  const errs = schemaErrors(value);
  return errs.length ? errs : contractErrors(value as ResearchOutput);
}

export function isResearchOutput(value: unknown): value is ResearchOutput {
  return validateResearchOutput(value).length === 0;
}
