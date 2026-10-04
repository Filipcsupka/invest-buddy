#!/usr/bin/env node
// Dependency-free validator for scan.schema.json (the draft 2020-12 subset used there)
// plus the contract rule "a true claim needs https evidence naming the field".
// CLI: node scanner/validate.mjs <payload.json>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const schema = JSON.parse(readFileSync(join(here, "schema", "scan.schema.json"), "utf8"));

const FORMATS = {
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s,
  "date-time": (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
};

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}
const typeOk = (t, v) => t === typeOf(v) || (t === "number" && typeOf(v) === "integer");

function resolve(ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
  return ref.slice(2).split("/").reduce((n, k) => n[k], schema);
}

function check(s, v, path, errs) {
  if (s.$ref) return check(resolve(s.$ref), v, path, errs);
  if ("const" in s && v !== s.const) errs.push(`${path}: must equal ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: must be one of ${s.enum.join(", ")}`);
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeOk(t, v))) { errs.push(`${path}: expected ${types.join("|")}, got ${typeOf(v)}`); return; }
  }
  if (typeof v === "string") {
    if (s.minLength != null && v.length < s.minLength) errs.push(`${path}: shorter than ${s.minLength}`);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength}`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${path}: does not match ${s.pattern}`);
    if (s.format && FORMATS[s.format] && !FORMATS[s.format](v)) errs.push(`${path}: not a valid ${s.format}`);
  }
  if (Array.isArray(v)) {
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => check(s.items, x, `${path}[${i}]`, errs));
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const k of s.required ?? []) if (!(k in v)) errs.push(`${path}.${k}: required`);
    const props = s.properties ?? {};
    for (const [k, x] of Object.entries(v)) {
      if (k in props) check(props[k], x, `${path}.${k}`, errs);
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: unknown field`);
    }
  }
}

const hasEvidence = (list, claim) => (list ?? []).some((e) => e && e.claim === claim && typeof e.url === "string" && e.url.startsWith("https://"));

// Contract rule: every true needs evidence naming the field.
function trueClaims(prefix, obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === true) out.push(`${prefix}.${k}`);
    if (k === "productCatalyst" && v && v.present === true) out.push(`${prefix}.${k}`);
  }
  return out;
}

export function validateTicker(t) {
  const errs = [];
  check(schema.$defs.ticker, t, "ticker", errs);
  if (!errs.length) {
    for (const c of trueClaims("fundamentals", t.fundamentals)) {
      if (!hasEvidence(t.evidence, c)) errs.push(`ticker.evidence: missing https evidence for ${c}`);
    }
  }
  return errs;
}

export function validateMacro(m) {
  const errs = [];
  check(schema.$defs.macro, m, "macro", errs);
  if (!errs.length) {
    for (const c of trueClaims("macro", m)) {
      if (!hasEvidence(m.evidence, c)) errs.push(`macro.evidence: missing https evidence for ${c}`);
    }
  }
  return errs;
}

export function validatePayload(p) {
  const errs = [];
  check(schema, p, "$", errs);
  if (!errs.length) {
    const seen = new Set();
    p.tickers.forEach((t, i) => {
      if (seen.has(t.symbol)) errs.push(`$.tickers[${i}].symbol: duplicate ${t.symbol}`);
      seen.add(t.symbol);
      for (const e of validateTicker(t).filter((x) => x.includes("missing https evidence"))) errs.push(`$.tickers[${i}] ${e}`);
    });
    for (const e of validateMacro(p.macro).filter((x) => x.includes("missing https evidence"))) errs.push(`$.macro ${e}`);
  }
  return errs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) { console.error("usage: validate.mjs <payload.json>"); process.exit(2); }
  const errs = validatePayload(JSON.parse(readFileSync(file, "utf8")));
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  console.log("ok");
}
