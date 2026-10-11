// Generated from src/research/types.ts and scanner/schema/research-output.schema.json.
// Regenerate: npx esbuild src/research/types.ts --bundle --platform=node --format=esm --target=node22 --outfile=scanner/research-validate.mjs
// scanner/schema/research-output.schema.json
var research_output_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "research output: run metadata written by the runner, findings written by the model. Facts only: no points, ratings, actions or amounts (docs/research-engine.md)",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "run", "output"],
  properties: {
    schemaVersion: { const: 1 },
    run: { $ref: "#/$defs/run" },
    output: { $ref: "#/$defs/modelOutput" }
  },
  $defs: {
    symbol: { type: "string", pattern: "^[A-Z0-9][A-Z0-9.-]{0,11}$" },
    httpsUrl: { type: "string", pattern: "^https://[^\\s]+$", maxLength: 500 },
    date: { type: "string", format: "date" },
    nullableDate: { type: ["string", "null"], format: "date" },
    themeId: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,39}$" },
    findingId: { type: "string", pattern: "^f[0-9]{1,3}$" },
    count: { type: ["integer", "null"], minimum: 0 },
    run: {
      type: "object",
      additionalProperties: false,
      required: ["runId", "runType", "asOf", "generatedAt", "promptVersion", "adapter", "scope", "limits", "usage", "status", "stopReason"],
      properties: {
        runId: { type: "string", format: "uuid" },
        runType: { type: "string", enum: ["weekly_discovery", "daily_watch", "deep_dive"] },
        asOf: { $ref: "#/$defs/date" },
        generatedAt: { type: "string", format: "date-time" },
        promptVersion: { type: "string", minLength: 1, maxLength: 60 },
        adapter: {
          type: "object",
          additionalProperties: false,
          required: ["name", "model", "authSource"],
          properties: {
            name: { type: "string", enum: ["claude", "codex"] },
            model: { type: "string", minLength: 1, maxLength: 60 },
            authSource: { type: "string", enum: ["subscription", "api", "codex"] }
          }
        },
        scope: {
          type: "object",
          additionalProperties: false,
          required: ["themes", "symbols", "deepDiveSymbol"],
          properties: {
            themes: { type: "array", maxItems: 40, items: { $ref: "#/$defs/themeId" } },
            symbols: { type: "array", maxItems: 300, items: { $ref: "#/$defs/symbol" } },
            deepDiveSymbol: { type: ["string", "null"], pattern: "^[A-Z0-9][A-Z0-9.-]{0,11}$" }
          }
        },
        limits: {
          type: "object",
          additionalProperties: false,
          required: ["maxTurns", "maxSearches", "maxFetches", "maxFindings", "timeoutS"],
          properties: {
            maxTurns: { type: "integer", minimum: 1, maximum: 60 },
            maxSearches: { type: "integer", minimum: 0, maximum: 100 },
            maxFetches: { type: "integer", minimum: 0, maximum: 200 },
            maxFindings: { type: "integer", minimum: 1, maximum: 60 },
            timeoutS: { type: "integer", minimum: 30, maximum: 3600 }
          }
        },
        usage: {
          type: "object",
          additionalProperties: false,
          required: ["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "webSearches", "webFetches", "costUsd", "durationS"],
          properties: {
            inputTokens: { $ref: "#/$defs/count" },
            outputTokens: { $ref: "#/$defs/count" },
            cacheReadTokens: { $ref: "#/$defs/count" },
            cacheCreationTokens: { $ref: "#/$defs/count" },
            webSearches: { $ref: "#/$defs/count" },
            webFetches: { $ref: "#/$defs/count" },
            costUsd: { type: ["number", "null"], minimum: 0 },
            durationS: { type: ["number", "null"], minimum: 0 }
          }
        },
        status: { type: "string", enum: ["ok", "partial", "cutoff", "failed"] },
        stopReason: { type: ["string", "null"], maxLength: 200 }
      }
    },
    modelOutput: {
      type: "object",
      additionalProperties: false,
      required: ["findings", "candidates", "chains", "notes"],
      properties: {
        findings: { type: "array", maxItems: 60, items: { $ref: "#/$defs/finding" } },
        candidates: { type: "array", maxItems: 20, items: { $ref: "#/$defs/candidate" } },
        chains: { type: "array", maxItems: 10, items: { $ref: "#/$defs/chain" } },
        notes: { type: ["string", "null"], maxLength: 600 }
      }
    },
    finding: {
      type: "object",
      additionalProperties: false,
      required: ["id", "symbol", "companyName", "exchange", "kind", "field", "polarity", "claim", "eventDate", "themes", "evidence", "figures", "confidence", "lead"],
      properties: {
        id: { $ref: "#/$defs/findingId" },
        symbol: { $ref: "#/$defs/symbol" },
        companyName: { type: "string", minLength: 1, maxLength: 120 },
        exchange: { type: ["string", "null"], maxLength: 20 },
        kind: { type: "string", enum: ["earnings", "guidance", "contract", "regulatory", "clinical", "product", "partnership", "capex", "m_and_a", "capital_allocation", "insider", "narrative", "supply_chain", "unusual_move", "risk"] },
        field: { type: ["string", "null"], enum: ["productCatalyst", "guidanceRaised", "guidanceCut", "narrativeChanged", null] },
        polarity: { type: "string", enum: ["positive", "negative", "neutral"] },
        claim: { type: "string", minLength: 1, maxLength: 240 },
        eventDate: { $ref: "#/$defs/nullableDate" },
        themes: { type: "array", maxItems: 5, items: { $ref: "#/$defs/themeId" } },
        evidence: { type: "array", minItems: 1, maxItems: 4, items: { $ref: "#/$defs/evidence" } },
        figures: { type: "array", maxItems: 5, items: { $ref: "#/$defs/figure" } },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        lead: { type: "boolean" }
      }
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["url", "quote", "publishedAt", "sourceName", "sourceClassHint"],
      properties: {
        url: { $ref: "#/$defs/httpsUrl" },
        quote: { type: "string", minLength: 20, maxLength: 500 },
        publishedAt: { $ref: "#/$defs/nullableDate" },
        sourceName: { type: "string", minLength: 1, maxLength: 80 },
        sourceClassHint: { type: "string", enum: ["primary", "press", "aggregator", "social"] }
      }
    },
    figure: {
      type: "object",
      additionalProperties: false,
      required: ["label", "value", "evidenceIndex"],
      properties: {
        label: { type: "string", minLength: 1, maxLength: 60 },
        value: { type: "string", minLength: 1, maxLength: 40 },
        evidenceIndex: { type: "integer", minimum: 0, maximum: 3 }
      }
    },
    cardLine: {
      type: "object",
      additionalProperties: false,
      required: ["text", "findingIds"],
      properties: {
        text: { type: "string", minLength: 1, maxLength: 300 },
        findingIds: { type: "array", minItems: 1, maxItems: 4, items: { $ref: "#/$defs/findingId" } }
      }
    },
    candidate: {
      type: "object",
      additionalProperties: false,
      required: ["symbol", "companyName", "exchange", "themes", "thesis", "findingIds", "upgradeTriggers", "invalidation", "card"],
      properties: {
        symbol: { $ref: "#/$defs/symbol" },
        companyName: { type: "string", minLength: 1, maxLength: 120 },
        exchange: { type: ["string", "null"], maxLength: 20 },
        themes: { type: "array", maxItems: 5, items: { $ref: "#/$defs/themeId" } },
        thesis: { type: "string", minLength: 1, maxLength: 300 },
        findingIds: { type: "array", minItems: 1, maxItems: 8, items: { $ref: "#/$defs/findingId" } },
        upgradeTriggers: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 200 } },
        invalidation: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", minLength: 1, maxLength: 200 } },
        card: {
          type: "object",
          additionalProperties: false,
          required: ["verdict", "whatHappened", "whyItMatters", "opportunityCost"],
          properties: {
            verdict: { type: "string", minLength: 1, maxLength: 200 },
            whatHappened: { type: "array", minItems: 2, maxItems: 3, items: { $ref: "#/$defs/cardLine" } },
            whyItMatters: { type: "array", minItems: 1, maxItems: 2, items: { $ref: "#/$defs/cardLine" } },
            opportunityCost: { type: ["string", "null"], maxLength: 300 }
          }
        }
      }
    },
    chain: {
      type: "object",
      additionalProperties: false,
      required: ["id", "development", "developmentFindingId", "spendingPool", "links"],
      properties: {
        id: { type: "string", pattern: "^c[0-9]{1,2}$" },
        development: { type: "string", minLength: 1, maxLength: 240 },
        developmentFindingId: { $ref: "#/$defs/findingId" },
        spendingPool: { type: "string", minLength: 1, maxLength: 240 },
        links: { type: "array", minItems: 1, maxItems: 12, items: { $ref: "#/$defs/chainLink" } }
      }
    },
    chainLink: {
      type: "object",
      additionalProperties: false,
      required: ["symbol", "companyName", "relation", "outcome", "findingIds"],
      properties: {
        symbol: { $ref: "#/$defs/symbol" },
        companyName: { type: "string", minLength: 1, maxLength: 120 },
        relation: { type: "string", enum: ["partner", "supplier", "customer", "infrastructure", "competitor", "indirect"] },
        outcome: { type: "string", enum: ["winner", "loser", "unclear"] },
        findingIds: { type: "array", minItems: 1, maxItems: 4, items: { $ref: "#/$defs/findingId" } }
      }
    }
  }
};

// src/research/types.ts
var RESEARCH_SCHEMA_VERSION = 1;
var RUN_TYPES = ["weekly_discovery", "daily_watch", "deep_dive"];
var ADAPTERS = ["claude", "codex"];
var AUTH_SOURCES = ["subscription", "api", "codex"];
var RUN_STATUSES = ["ok", "partial", "cutoff", "failed"];
var FINDING_KINDS = [
  "earnings",
  "guidance",
  "contract",
  "regulatory",
  "clinical",
  "product",
  "partnership",
  "capex",
  "m_and_a",
  "capital_allocation",
  "insider",
  "narrative",
  "supply_chain",
  "unusual_move",
  "risk"
];
var SCORE_FIELDS = ["productCatalyst", "guidanceRaised", "guidanceCut", "narrativeChanged"];
var POLARITIES = ["positive", "negative", "neutral"];
var CONFIDENCES = ["high", "medium", "low"];
var SOURCE_CLASSES = ["primary", "press", "aggregator", "social"];
var CHAIN_RELATIONS = ["partner", "supplier", "customer", "infrastructure", "competitor", "indirect"];
var CHAIN_OUTCOMES = ["winner", "loser", "unclear"];
var VERIFICATION_STATUSES = ["pending", "verified", "quote_not_found", "fetch_failed", "blocked", "stale", "lead_only"];
var READING_LABEL = "one model reading checked against the quote";
var PIPELINE_STATES = ["DISCOVERED", "WATCH", "START_READY", "ADD_READY", "HOLD", "REDUCE", "BROKEN", "DROPPED"];
var SUPPORTED_KEYWORDS = [
  "$schema",
  "title",
  "$ref",
  "$defs",
  "type",
  "const",
  "enum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "items",
  "required",
  "properties",
  "additionalProperties"
];
var researchSchema = research_output_schema_default;
var FORMATS = {
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && (/* @__PURE__ */ new Date(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s,
  "date-time": (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s))
};
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number" && Number.isInteger(v)) return "integer";
  return typeof v;
}
var typeOk = (t, v) => t === typeOf(v) || t === "number" && typeOf(v) === "integer";
function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
  let node = root;
  for (const key of ref.slice(2).split("/")) {
    node = node && typeof node === "object" ? node[key] : void 0;
    if (node === void 0) throw new Error(`unresolved $ref ${ref}`);
  }
  return node;
}
function walk(s, v, path, errs, root) {
  if (s.$ref) return walk(resolveRef(s.$ref, root), v, path, errs, root);
  if ("const" in s && v !== s.const) errs.push(`${path}: must equal ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: must be one of ${s.enum.map((x) => String(x)).join(", ")}`);
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeOk(t, v))) {
      errs.push(`${path}: expected ${types.join("|")}, got ${typeOf(v)}`);
      return;
    }
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
    const format = s.format ? FORMATS[s.format] : void 0;
    if (format && !format(v)) errs.push(`${path}: not a valid ${s.format}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) errs.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => walk(s.items, x, `${path}[${i}]`, errs, root));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const obj = v;
    for (const k of s.required ?? []) if (!(k in obj)) errs.push(`${path}.${k}: required`);
    const props = s.properties ?? {};
    for (const [k, x] of Object.entries(obj)) {
      if (k in props) walk(props[k], x, `${path}.${k}`, errs, root);
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: unknown field`);
    }
  }
}
function schemaErrors(value, schema = researchSchema) {
  const errs = [];
  walk(schema, value, "$", errs, schema);
  return errs;
}
var ADVICE_PATTERN = /\b(?:you should|we recommend|recommend(?:ed|s)? (?:buying|selling)|strong buy|buy rating|sell rating|start (?:a |the )?position|add to (?:a |the |your )?position|high[- ]conviction|take profits?|price target|stop[- ]loss|START_POSITION|HIGH_CONVICTION_ADD|THESIS_BROKEN|CSPX_ALLOCATION|START_READY|ADD_READY)\b|\b\d+\s*(?:\/\s*25|of\s+25)\s*(?:points?|pts)\b/i;
var FIELD_KINDS = {
  productCatalyst: ["product", "contract", "regulatory", "clinical", "partnership"],
  guidanceRaised: ["guidance"],
  guidanceCut: ["guidance"],
  narrativeChanged: ["narrative"]
};
var FIELD_POLARITY = { guidanceRaised: "positive", guidanceCut: "negative" };
function numberTokens(text) {
  const joined = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  return (joined.match(/\d+(?:\.\d+)?/g) ?? []).map((t) => t.replace(/^0+(?=\d)/, ""));
}
function contractErrors(o) {
  const errs = [];
  const { run, output } = o;
  if (run.runType === "deep_dive" && run.scope.deepDiveSymbol === null) errs.push("$.run.scope.deepDiveSymbol: required for a deep_dive run");
  if (run.runType !== "deep_dive" && run.scope.deepDiveSymbol !== null) errs.push("$.run.scope.deepDiveSymbol: only a deep_dive run names one");
  if (run.runType === "weekly_discovery" && run.scope.themes.length === 0) errs.push("$.run.scope.themes: a weekly_discovery run needs at least one theme");
  if (output.findings.length > run.limits.maxFindings) errs.push(`$.output.findings: ${output.findings.length} findings over the run limit ${run.limits.maxFindings}`);
  const findings = /* @__PURE__ */ new Map();
  output.findings.forEach((f, i) => {
    const at = `$.output.findings[${i}]`;
    if (findings.has(f.id)) errs.push(`${at}.id: duplicate ${f.id}`);
    findings.set(f.id, f);
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
      if (!ev) {
        errs.push(`${at}.figures[${j}].evidenceIndex: no evidence item ${g.evidenceIndex}`);
        return;
      }
      const wanted = numberTokens(g.value);
      if (wanted.length === 0) {
        errs.push(`${at}.figures[${j}].value: has no number`);
        return;
      }
      const have = new Set(numberTokens(ev.quote));
      const missing = wanted.filter((t) => !have.has(t));
      if (missing.length) errs.push(`${at}.figures[${j}].value: ${missing.join(", ")} not in the quote of evidence ${g.evidenceIndex}`);
    });
  });
  const known = (id, at) => {
    if (!findings.has(id)) errs.push(`${at}: unknown finding ${id}`);
  };
  const symbols = /* @__PURE__ */ new Set();
  output.candidates.forEach((c, i) => {
    const at = `$.output.candidates[${i}]`;
    if (symbols.has(c.symbol)) errs.push(`${at}.symbol: duplicate ${c.symbol}`);
    symbols.add(c.symbol);
    c.findingIds.forEach((id, j) => known(id, `${at}.findingIds[${j}]`));
    if (!c.findingIds.some((id) => findings.get(id)?.symbol === c.symbol)) errs.push(`${at}.findingIds: no finding about ${c.symbol}`);
    if (c.findingIds.every((id) => findings.get(id)?.lead !== false)) errs.push(`${at}.findingIds: a candidate needs at least one finding that is not a lead`);
    [...c.card.whatHappened, ...c.card.whyItMatters].forEach((line, j) => line.findingIds.forEach((id, k) => known(id, `${at}.card line ${j} findingIds[${k}]`)));
  });
  const chainIds = /* @__PURE__ */ new Set();
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
  const texts = [];
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
function validateResearchOutput(value) {
  const errs = schemaErrors(value);
  return errs.length ? errs : contractErrors(value);
}
function isResearchOutput(value) {
  return validateResearchOutput(value).length === 0;
}
export {
  ADAPTERS,
  ADVICE_PATTERN,
  AUTH_SOURCES,
  CHAIN_OUTCOMES,
  CHAIN_RELATIONS,
  CONFIDENCES,
  FINDING_KINDS,
  PIPELINE_STATES,
  POLARITIES,
  READING_LABEL,
  RESEARCH_SCHEMA_VERSION,
  RUN_STATUSES,
  RUN_TYPES,
  SCORE_FIELDS,
  SOURCE_CLASSES,
  SUPPORTED_KEYWORDS,
  VERIFICATION_STATUSES,
  isResearchOutput,
  numberTokens,
  researchSchema,
  schemaErrors,
  validateResearchOutput
};
