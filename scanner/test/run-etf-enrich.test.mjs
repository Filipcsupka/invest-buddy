import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunks, execute, parseArgs, validateBatch } from "../run-etf-enrich.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/eodhd-etf.json", import.meta.url)));
const first = { listingKey: "NYSEARCA:SPY", isin: null, symbol: "SPY", exchange: "NYSEARCA", name: "SPDR ETF" };
const enriched = { listingKey: first.listingKey, isin: "US78462F1030", issuer: "State Street", assetClass: "equity", region: "US", theme: null, trackedIndex: "S&P 500", terPct: 0.09, aumUsdM: 600000, domicile: "US", replication: "physical", distribution: "dist", ucits: false, sourceUrl: "https://example.com/spy" };

test("enrichment schema requires every listing and an HTTPS source", () => {
  assert.deepEqual(validateBatch({ items: [enriched] }, [first]), []);
  assert.match(validateBatch({ items: [] }, [first]).join(" "), /items|missing/);
  assert.match(validateBatch({ items: [{ ...enriched, sourceUrl: "http://example.com" }] }, [first]).join(" "), /sourceUrl/);
  assert.deepEqual(chunks(Array.from({ length: 41 }, (_, i) => i)).map((batch) => batch.length), [20,20,1]);
});

test("failed enrichment batch leaves it pending and later batch posts", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-enrich-test-")); let vendorCalls = 0; const posts = [];
  const items = Array.from({ length: 21 }, (_, i) => ({ ...first, listingKey: `NYSEARCA:E${i}`, symbol: `E${i}` }));
  const request = async (url, init = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body)); return { ok: true }; }
    if (String(url).includes("/pending?")) return { ok: true, json: async () => ({ items }) };
    return ++vendorCalls === 1 ? { ok: false, status: 500 } : { ok: true, json: async () => fixture };
  };
  try {
    const result = await execute(parseArgs(["--limit", "21", "--out-dir", outDir]), { env: { INGEST_TOKEN: "test", EODHD_API_KEY: "test" }, request, log: () => {} });
    assert.deepEqual(result, { batches: 2, failed: 1 });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].items[0].listingKey, "NYSEARCA:E20");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("a missing EODHD key fails the batch without an ingest write", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-enrich-test-")); const posts = [];
  const request = async (url, init = {}) => init.method === "POST" ? (posts.push(init.body), { ok: true }) : { ok: true, json: async () => ({ items: [first] }) };
  try {
    const result = await execute(parseArgs(["--out-dir", outDir]), { env: { INGEST_TOKEN: "test" }, request, log: () => {} });
    assert.deepEqual(result, { batches: 1, failed: 1 });
    assert.equal(posts.length, 0);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});
