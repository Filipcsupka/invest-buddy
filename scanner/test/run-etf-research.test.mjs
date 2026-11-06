import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveStrictSchema } from "../research-adapters.mjs";
import { buildPrompt, chunks, execute, parseArgs, validateEtfOutput } from "../run-etf-research.mjs";

const candidate = {
  symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF", isin: null, assetClass: "equity", region: "US", call: "BUY_ZONE", conviction: 3,
  thesis: "A broad index fund", whatHappened: [], whyItMatters: "Low cost", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
  cost: { terPct: 0.1, aumUsdM: 100, trackedIndex: "Test Index", domicile: "US", replication: "physical" },
  price: { last: 100, currency: "USD", asOf: "2026-10-20" },
  evidence: [{ url: "https://example.com/etf", quote: "The total expense ratio is zero point one percent.", claim: "ter" }],
};
const output = { asOf: "2026-10-21", candidates: [candidate] };
const item = { listingKey: "NYSEARCA:ETF1", isin: null, symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF" };

test("root ETF schema allows 25 shortlist cards and validates complete chunks", () => {
  const schema = JSON.parse(readFileSync(new URL("../schema/etf-output.schema.json", import.meta.url), "utf8"));
  const strict = deriveStrictSchema(schema, "root");
  assert.deepEqual(strict.required, ["asOf", "candidates"]);
  assert.equal(schema.properties.candidates.maxItems, 28);
  assert.deepEqual(validateEtfOutput(output, output.asOf, [item]), []);
  assert.match(validateEtfOutput({ ...output, candidates: [] }, output.asOf, [item]).join(" "), /missing shortlist/);
  assert.match(validateEtfOutput({ ...output, candidates: [{ ...candidate, price: { ...candidate.price, last: 0 } }] }, output.asOf).join(" "), /positive/);
  assert.match(buildPrompt(output.asOf, [item], "ETF prompt {{shortlist}}"), /NYSEARCA:ETF1/);
  assert.deepEqual(chunks(Array.from({ length: 51 }, (_, i) => i)).map((part) => part.length), [25,25,1]);
});

test("RESEARCH_ENABLED=off skips without a model or HTTP call", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-"));
  try {
    const opts = parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir], { INGEST_BASE_URL: "http://localhost" });
    const result = await execute(opts, { adapter: { name: "codex", run: async () => { throw new Error("model called"); } }, env: { INGEST_TOKEN: "token", RESEARCH_ENABLED: "off" },
      request: async () => { throw new Error("HTTP called"); }, log: () => {} });
    assert.equal(result.status, "skipped");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("ETF run posts each validated chunk without quota gates", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-")); const posts = [];
  try {
    const opts = parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir], { INGEST_BASE_URL: "http://localhost" });
    const adapter = { name: "codex", available: () => ({ ok: true }), run: async (args) => { assert.equal(args.schemaName, "root"); return { text: JSON.stringify(output), usage: { inputTokens: 100 }, webSearches: 4, model: "test-model" }; } };
    const request = async (url, init) => url.endsWith("/shortlist") ? { ok: true, json: async () => ({ items: [item] }) } : (posts.push(JSON.parse(init.body)), { ok: true });
    const result = await execute(opts, { adapter, env: { INGEST_TOKEN: "token", RESEARCH_ENABLED: "on", RESEARCH_MONTHLY_USD: "0", AI_DAILY_TOKEN_CEILING: "0" },
      template: "ETF prompt {{shortlist}}", request, log: () => {} });
    assert.equal(result.status, "ok"); assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].output, output);
    assert.equal(posts[0].run.usage.webSearches, 4);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("a failed chunk does not prevent later chunks from posting", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-")); const posts = [];
  const items = Array.from({ length: 26 }, (_, i) => ({ ...item, listingKey: `NYSEARCA:E${i}`, symbol: `E${i}` }));
  let calls = 0;
  try {
    const adapter = { name: "codex", run: async () => { if (++calls === 1) throw new Error("temporary model error"); return { text: JSON.stringify({ ...output, candidates: [{ ...candidate, symbol: "E25" }] }), usage: {} }; } };
    const request = async (url, init) => url.endsWith("/shortlist") ? { ok: true, json: async () => ({ items }) } : (posts.push(JSON.parse(init.body)), { ok: true });
    const result = await execute(parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir]), { adapter, env: { INGEST_TOKEN: "token" }, request, log: () => {} });
    assert.deepEqual({ batches: result.batches, failed: result.failed }, { batches: 2, failed: 1 });
    assert.equal(posts.length, 1); assert.equal(posts[0].output.candidates[0].symbol, "E25");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});
