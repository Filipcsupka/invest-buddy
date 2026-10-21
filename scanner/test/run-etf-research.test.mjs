import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveStrictSchema } from "../research-adapters.mjs";
import { buildPrompt, execute, parseArgs, validateEtfOutput } from "../run-etf-research.mjs";

const candidate = {
  symbol: "ETF1", exchange: "NYSE ARCA", name: "Test ETF", isin: null, assetClass: "equity", region: "US", call: "BUY_ZONE", conviction: 3,
  thesis: "A broad index fund", whatHappened: [], whyItMatters: "Low cost", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
  cost: { terPct: 0.1, aumUsdM: 100, trackedIndex: "Test Index", domicile: "US", replication: "physical" },
  price: { last: 100, currency: "USD", asOf: "2026-10-20" },
  evidence: [{ url: "https://example.com/etf", quote: "The total expense ratio is zero point one percent.", claim: "ter" }],
};
const output = { asOf: "2026-10-21", candidates: [candidate] };

test("root ETF schema is strict and model output is checked", () => {
  const schema = JSON.parse(readFileSync(new URL("../schema/etf-output.schema.json", import.meta.url), "utf8"));
  const strict = deriveStrictSchema(schema, "root");
  assert.deepEqual(strict.required, ["asOf", "candidates"]);
  assert.equal(strict.additionalProperties, false);
  assert.deepEqual(validateEtfOutput(output, output.asOf), []);
  assert.match(validateEtfOutput({ ...output, candidates: [{ ...candidate, price: { ...candidate.price, last: 0 } }] }, output.asOf).join(" "), /positive/);
  assert.match(buildPrompt(output.asOf, "ETF prompt"), /ETF prompt/);
});

test("RESEARCH_ENABLED=off records a skip without calling the model", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-"));
  const posts = [];
  try {
    const opts = parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir], { INGEST_BASE_URL: "http://localhost" });
    const adapter = { name: "codex", run: async () => { throw new Error("model called"); } };
    const result = await execute(opts, { adapter, env: { INGEST_TOKEN: "token", RESEARCH_ENABLED: "off" },
      post: async (_url, init) => { posts.push(JSON.parse(init.body)); return { ok: true }; }, log: () => {} });
    assert.equal(result.status, "skipped");
    assert.equal(posts[0].output, null);
    assert.equal(posts[0].run.stopReason, "RESEARCH_ENABLED=off");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("ETF run posts validated cards without quota gates", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-"));
  const posts = [];
  let calls = 0;
  try {
    const opts = parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir], { INGEST_BASE_URL: "http://localhost" });
    const adapter = { name: "codex", available: () => ({ ok: true }), run: async (args) => {
      calls++;
      assert.equal(args.schemaName, "root");
      return { text: JSON.stringify(output), usage: { inputTokens: 100 }, webSearches: 4, model: "test-model" };
    } };
    const result = await execute(opts, { adapter, env: { INGEST_TOKEN: "token", RESEARCH_ENABLED: "on", RESEARCH_MONTHLY_USD: "0", AI_DAILY_TOKEN_CEILING: "0" },
      template: "ETF prompt", post: async (_url, init) => { posts.push(JSON.parse(init.body)); return { ok: true }; }, log: () => {} });
    assert.equal(calls, 1);
    assert.equal(result.status, "ok");
    assert.deepEqual(posts[0].output, output);
    assert.equal(posts[0].run.usage.webSearches, 4);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});
