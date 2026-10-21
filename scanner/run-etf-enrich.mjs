#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractJson, getToken } from "./run-scan.mjs";
import { codexResearchAdapter } from "./research-adapters.mjs";
import { schemaErrors } from "./research-validate.mjs";
import { enrichEodhd, vendorSymbol } from "./eodhd-etf-enrich.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema", "etf-enrich.schema.json");
const promptPath = join(here, "prompts", "etf-enrich.md");
export const chunks = (items, size = 20) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
export function parseArgs(argv, env = process.env) {
  const opts = { limit: env.ETF_ENRICH_SOURCE === "eodhd" ? 20 : 10000, dryRun: false, baseUrl: env.INGEST_BASE_URL || "http://web.invest.svc.cluster.local:3000", timeoutS: 1200, outDir: env.RESEARCH_OUT_DIR || join(here, "out") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") opts.dryRun = true;
    else if (["--limit", "--base-url", "--timeout-s", "--out-dir"].includes(argv[i])) { const key = { "--limit": "limit", "--base-url": "baseUrl", "--timeout-s": "timeoutS", "--out-dir": "outDir" }[argv[i]]; if (++i === argv.length) throw new Error(`Missing value for ${argv[i-1]}`); opts[key] = ["limit", "timeoutS"].includes(key) ? Number(argv[i]) : argv[i]; }
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 10000) throw new Error("--limit must be 1 to 10000");
  if (!Number.isInteger(opts.timeoutS) || opts.timeoutS < 30 || opts.timeoutS > 3600) throw new Error("--timeout-s must be 30 to 3600");
  return opts;
}
export function validateBatch(output, input) {
  const errors = schemaErrors(output, JSON.parse(readFileSync(schemaPath, "utf8")));
  if (errors.length) return errors;
  const expected = new Set(input.map((item) => item.listingKey)); const seen = new Set();
  for (const item of output.items) { if (!expected.has(item.listingKey)) errors.push(`unexpected listing ${item.listingKey}`); if (seen.has(item.listingKey)) errors.push(`duplicate listing ${item.listingKey}`); seen.add(item.listingKey); }
  for (const key of expected) if (!seen.has(key)) errors.push(`missing listing ${key}`);
  return errors;
}
export async function execute(opts, { adapter = codexResearchAdapter, env = process.env, request = fetch, log = console.log } = {}) {
  if (env.RESEARCH_ENABLED === "off") { log("etf-enrich: skipped by RESEARCH_ENABLED=off"); return { batches: 0, failed: 0 }; }
  const source = env.ETF_ENRICH_SOURCE || "codex";
  if (!["codex", "eodhd"].includes(source)) throw new Error("ETF_ENRICH_SOURCE must be eodhd or codex");
  const maxCalls = Number(env.ETF_EODHD_MAX_CALLS ?? 500);
  if (source === "eodhd" && (!Number.isInteger(maxCalls) || maxCalls < 10 || maxCalls % 10 !== 0)) throw new Error("ETF_EODHD_MAX_CALLS must be a positive multiple of 10");
  const token = env.INGEST_TOKEN || getToken(); if (!token) throw new Error("INGEST_TOKEN is required");
  if (source === "codex") { const auth = adapter.available?.(env); if (auth && !auth.ok) throw new Error(auth.reason); }
  const base = opts.baseUrl.replace(/\/$/, "");
  const response = await request(`${base}/api/ingest/etf-catalog/pending?limit=${opts.limit}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`ETF pending HTTP ${response.status}`);
  const { items } = await response.json(); if (!Array.isArray(items)) throw new Error("ETF pending response has no items array");
  const selected = []; const symbols = new Set();
  for (const row of items) {
    const symbol = source === "eodhd" ? vendorSymbol(row) : null;
    if (symbol && !symbols.has(symbol) && symbols.size * 10 >= maxCalls) break;
    selected.push(row);
    if (symbol) symbols.add(symbol);
  }
  if (source === "eodhd" && selected.length < items.length) log(`etf-enrich eodhd: stopped at ${maxCalls}-call cap; ${items.length - selected.length} rows deferred`);
  let failed = 0; const batches = chunks(selected); const cache = new Map();
  mkdirSync(opts.outDir, { recursive: true });
  for (const [index, batch] of batches.entries()) {
    const workDir = mkdtempSync(join(tmpdir(), "invest-etf-enrich-"));
    try {
      let output;
      if (source === "eodhd") {
        const result = await enrichEodhd(batch, { apiKey: env.EODHD_API_KEY, request, dryRun: opts.dryRun, log, cache });
        if (opts.dryRun) continue;
        output = { items: result.items };
      } else {
        const prompt = `${readFileSync(promptPath, "utf8")}\n${JSON.stringify(batch)}\n\nReturn JSON matching:\n${readFileSync(schemaPath, "utf8")}`;
        const result = await adapter.run({ prompt, schemaPath, schemaName: "root", timeoutMs: opts.timeoutS * 1000, workDir, env });
        output = extractJson(result.text);
      }
      const errors = validateBatch(output, batch);
      if (errors.length) throw new Error(errors.join("; "));
      const file = join(opts.outDir, `etf-enrich-${Date.now()}-${index}.json`); writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
      if (!opts.dryRun) { const posted = await request(`${base}/api/ingest/etf-catalog`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(output), signal: AbortSignal.timeout(120_000) }); if (!posted.ok) throw new Error(`ETF enrichment ingest HTTP ${posted.status}`); }
      log(`etf-enrich batch ${index+1}/${batches.length}: ${batch.length} rows${opts.dryRun ? " (dry run)" : ""}`);
    } catch (error) { failed++; console.error(`etf-enrich batch ${index+1}/${batches.length}: ${error.message}`); if (source === "eodhd" && /HTTP (402|429)/.test(error.message)) throw error; }
    finally { rmSync(workDir, { recursive: true, force: true }); }
  }
  return { batches: batches.length, failed };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) execute(parseArgs(process.argv.slice(2))).then(({ failed }) => { if (failed) process.exitCode = 1; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
