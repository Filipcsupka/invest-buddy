// Helpers for run-extract.mjs: reproducible input hash, usage from the Claude JSON envelope,
// and the two calls to /api/ingest/extraction-runs (skip check, record). No database credentials here.
import { createHash } from "node:crypto";

/** Stable JSON: object keys sorted, so the same data always hashes the same. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/**
 * Hash of what the model would see. The bundle's generatedAt and since change on every request and are left out.
 * Documents and facts are sorted so row order from the database does not matter. Prompt text, agent and model are part of the hash,
 * so changing any of them runs the extraction again.
 */
export function inputHash({ bundle, prompt, agent, model }) {
  const docs = [...(bundle.documents ?? [])].map((d) => ({ id: d.id, url: d.url, docType: d.docType, publishedAt: d.publishedAt, displayAllowed: d.displayAllowed === true, excerpt: d.excerpt })).sort((a, b) => a.id - b.id || a.url.localeCompare(b.url));
  const facts = [...(bundle.facts ?? [])].map((f) => ({ key: f.key, asOf: f.asOf, value: f.value })).sort((a, b) => a.key.localeCompare(b.key) || a.asOf.localeCompare(b.asOf));
  return createHash("sha256").update(canonical({ symbol: bundle.symbol, documents: docs, facts, prompt: createHash("sha256").update(prompt).digest("hex"), agent, model: model || "default" })).digest("hex");
}

const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
/** `claude -p --output-format json` envelope to usage columns. Missing numbers stay null. */
export function usageFromEnvelope(env) {
  const u = env?.usage ?? {};
  return { inputTokens: int(u.input_tokens), outputTokens: int(u.output_tokens), cacheReadTokens: int(u.cache_read_input_tokens), cacheCreationTokens: int(u.cache_creation_input_tokens), turns: int(env?.num_turns) };
}

async function call(baseUrl, token, path, init) {
  const res = await fetch(`${baseUrl}/api/ingest/extraction-runs${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`extraction-runs HTTP ${res.status}`);
  return res.json();
}
/** True when an ok run with this input already exists. An unavailable check stops automatic reprocessing. */
export async function alreadyExtracted(baseUrl, token, key) {
  return (await call(baseUrl, token, `?${new URLSearchParams({ symbol: key.symbol, agent: key.agent, inputHash: key.inputHash })}`, { method: "GET" })).skip === true;
}
/** Best effort: a failed log write must not fail the extraction. */
export async function recordRun(baseUrl, token, run, log = () => {}) {
  try { await call(baseUrl, token, "", { method: "POST", body: JSON.stringify(run) }); }
  catch (e) { log(`${run.symbol}: could not record extraction run: ${e.message}`); }
}
