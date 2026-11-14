import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveStrictSchema } from "../research-adapters.mjs";
import { buildPrompt, candidateUrl, chunks, execute, parseArgs, validateEtfOutput } from "../run-etf-research.mjs";

const candidate = {
  symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF", isin: null, assetClass: "equity", region: "US", call: "BUY_ZONE", conviction: 3,
  thesis: "A broad index fund", whatHappened: [], whyItMatters: "Low cost", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
  cost: { terPct: 0.1, aumUsdM: 100, trackedIndex: "Test Index", domicile: "US", replication: "physical" },
  price: { last: null, currency: null, asOf: null },
  evidence: [],
};
const output = { asOf: "2026-10-21", candidates: [candidate] };
const item = { listingKey: "NYSEARCA:ETF1", isin: null, symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF", assetClass: "equity", region: "US", terPct: 0.1, aumUsdM: 100, trackedIndex: "Test Index", domicile: "US", replication: "physical" };

test("root ETF schema allows 25 shortlist cards and validates complete chunks", () => {
  const schema = JSON.parse(readFileSync(new URL("../schema/etf-output.schema.json", import.meta.url), "utf8"));
  const strict = deriveStrictSchema(schema, "root");
  assert.deepEqual(strict.required, ["asOf", "candidates"]);
  assert.equal(schema.properties.candidates.maxItems, 28);
  assert.deepEqual(validateEtfOutput(output, output.asOf, [item]), []);
  // A money market fund from the catalog passes the schema and the catalog identity check.
  const cash = { ...candidate, assetClass: "money_market" };
  assert.deepEqual(validateEtfOutput({ ...output, candidates: [cash] }, output.asOf, [{ ...item, assetClass: "money_market" }]), []);
  assert.match(validateEtfOutput({ ...output, candidates: [] }, output.asOf, [item]).join(" "), /missing shortlist/);
  assert.match(validateEtfOutput({ ...output, candidates: [{ ...candidate, price: { ...candidate.price, last: 0 } }] }, output.asOf).join(" "), /positive/);
  assert.match(buildPrompt(output.asOf, [item], "ETF prompt {{shortlist}}"), /NYSEARCA:ETF1/);
  assert.deepEqual(chunks(Array.from({ length: 51 }, (_, i) => i)).map((part) => part.length), [25,25,1]);
  assert.throws(() => parseArgs(["--input-file", "shortlist.json"]), /requires --dry-run/);
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

test("ETF run posts each validated chunk under the monthly guard", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-")); const posts = [];
  try {
    const opts = parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir], { INGEST_BASE_URL: "http://localhost" });
    const adapter = { name: "codex", available: () => ({ ok: true }), run: async (args) => { assert.equal(args.schemaName, "root"); assert.equal(args.allowSearch, false); return { text: JSON.stringify(output), usage: { inputTokens: 100 }, webSearches: 0, model: "test-model" }; } };
    const request = async (url, init) => url.endsWith("/top-rated?limit=25") ? { ok: true, json: async () => ({ items: [{ ...item, ratingPercent: 78, ratingBand: "rulesMet", evidencedPoints: 90 }] }) } : url.endsWith("/ai-budget") && !init?.method ? { ok: true, json: async () => ({ tokensPerDayUtc: {} }) } : (url.endsWith("/etf") && posts.push(JSON.parse(init.body)), { ok: true, json: async () => ({ recorded: true }) });
    const result = await execute(opts, { adapter, env: { INGEST_TOKEN: "token", RESEARCH_ENABLED: "on", EODHD_PRIVATE_USE: "on", RESEARCH_MONTHLY_USD: "0", AI_DAILY_TOKEN_CEILING: "0" },
      template: "ETF prompt {{shortlist}}", request, log: () => {} });
    assert.equal(result.status, "ok"); assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].output, output);
    assert.equal(posts[0].run.usage.webSearches, 0);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("a failed chunk does not prevent later chunks from posting", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-")); const posts = [];
  const items = Array.from({ length: 26 }, (_, i) => ({ ...item, listingKey: `NYSEARCA:E${i}`, symbol: `E${i}` }));
  let calls = 0;
  try {
    const adapter = { name: "codex", run: async () => { if (++calls === 1) throw new Error("temporary model error"); return { text: JSON.stringify({ ...output, candidates: [{ ...candidate, symbol: "E25" }] }), usage: {} }; } };
    const request = async (url, init) => url.endsWith("/shortlist") ? { ok: true, json: async () => ({ items }) } : url.endsWith("/ai-budget") && !init?.method ? { ok: true, json: async () => ({ tokensPerDayUtc: {} }) } : (url.endsWith("/etf") && posts.push(JSON.parse(init.body)), { ok: true, json: async () => ({ recorded: true }) });
    const result = await execute(parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir, "--selection", "shortlist", "--limit", "26"]), { adapter, env: { INGEST_TOKEN: "token", EODHD_PRIVATE_USE: "on" }, request, log: () => {} });
    assert.deepEqual({ batches: result.batches, failed: result.failed }, { batches: 2, failed: 1 });
    assert.equal(posts.length, 1); assert.equal(posts[0].output.candidates[0].symbol, "E25");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("offline dry run reads an enriched shortlist without auth, network or model calls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "etf-offline-"));
  const input = join(dir, "shortlist.json");
  writeFileSync(input, JSON.stringify({ items: [item] }));
  try {
    const logs = [];
    const result = await execute(parseArgs(["--dry-run", "--input-file", input, "--out-dir", dir], {}), {
      env: { RESEARCH_ENABLED: "on" }, adapter: { run: async () => { throw new Error("model called"); } }, request: async () => { throw new Error("network called"); }, log: (line) => logs.push(line),
    });
    assert.equal(result.status, "ok");
    assert.match(logs.join(" "), /0 model calls/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ETF output cannot add facts or citations absent from the catalog", () => {
  const changed = { ...candidate, cost: { ...candidate.cost, terPct: 0.01 }, evidence: [{ url: "https://example.com", quote: "Invented expense ratio", claim: "ter" }] };
  assert.match(validateEtfOutput({ ...output, candidates: [changed] }, output.asOf, [item]).join(" "), /cost.terPct differs|must not create evidence/);
  const invented = { ...candidate, thesis: "Expense ratio is 0.4 percent" };
  assert.match(validateEtfOutput({ ...output, candidates: [invented] }, output.asOf, [item]).join(" "), /figures not in stored catalog/);
});

test("live ETF research requires private mode before any network or model call", async () => {
  await assert.rejects(execute(parseArgs(["--as-of", "2026-10-21"]), {
    env: { INGEST_TOKEN: "token" }, request: async () => { throw new Error("network called"); },
    adapter: { run: async () => { throw new Error("model called"); } },
  }), /EODHD_PRIVATE_USE=on/);
});

test("selects the highest rated funds by default and keeps the shortlist as an option", () => {
  const defaults = parseArgs(["--as-of", "2026-11-14"], {});
  assert.equal(defaults.selection, "top-rated");
  assert.equal(defaults.limit, 25);
  assert.equal(candidateUrl("http://web", defaults), "http://web/api/ingest/etf-catalog/top-rated?limit=25");
  const shortlist = parseArgs(["--as-of", "2026-11-14", "--selection", "shortlist", "--limit", "150"], {});
  assert.equal(candidateUrl("http://web", shortlist), "http://web/api/ingest/etf-catalog/shortlist");
  assert.equal(parseArgs(["--as-of", "2026-11-14"], { RESEARCH_ETF_SELECTION: "shortlist", RESEARCH_ETF_LIMIT: "10" }).limit, 10);
  assert.throws(() => parseArgs(["--selection", "everything"], {}), /--selection must be one of top-rated, shortlist/);
  for (const limit of ["0", "151", "2.5", "x"]) assert.throws(() => parseArgs(["--limit", limit], {}), /--limit must be 1 to 150/);
});

test("caps the candidate list at the limit before any model call", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-test-")); const logs = [];
  const items = Array.from({ length: 30 }, (_, i) => ({ ...item, listingKey: `NYSEARCA:E${i}`, symbol: `E${i}` }));
  try {
    const result = await execute(parseArgs(["--as-of", "2026-10-21", "--out-dir", outDir, "--limit", "3", "--dry-run"], {}), { env: { INGEST_TOKEN: "token" }, adapter: { run: async () => { throw new Error("model called"); } },
      request: async (url) => { assert.equal(url, "http://web.invest.svc.cluster.local:3000/api/ingest/etf-catalog/top-rated?limit=3"); return { ok: true, json: async () => ({ items }) }; }, log: (line) => logs.push(line) });
    assert.deepEqual({ status: result.status, batches: result.batches }, { status: "ok", batches: 1 });
    assert.match(logs.join("\n"), /3 top-rated candidates/);
    assert.match(logs.join("\n"), /batch 1\/1: 3 stored rows/);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("the repo copy of the weekly research CronJob stays suspended", () => {
  const yaml = readFileSync(new URL("../../deploy/gitops/gitops/apps/invest-buddy/base/etf-cronjobs.yaml", import.meta.url), "utf8");
  const doc = yaml.split(/^---$/m).find((part) => /name: invest-buddy-etf-research$/m.test(part));
  assert.ok(doc, "research CronJob present");
  assert.match(doc, /^ {2}suspend: true$/m);
});
