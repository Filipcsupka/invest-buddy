// Small JSON Schema checker for the ETF runners and ingest routes. It supports the keywords in SUPPORTED_KEYWORDS only.
// The file name is kept from the removed stock research runner so the ETF imports stay unchanged.
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
function schemaErrors(value, schema) {
  const errs = [];
  walk(schema, value, "$", errs, schema);
  return errs;
}
export { SUPPORTED_KEYWORDS, schemaErrors };
