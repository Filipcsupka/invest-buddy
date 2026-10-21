import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunks, execute, parseArgs, validateBatch } from "../run-etf-enrich.mjs";

const first = { listingKey: "NYSEARCA:SPY", isin: null, symbol: "SPY", exchange: "NYSEARCA", name: "SPDR ETF" };
const enriched = { listingKey: first.listingKey, isin: "US78462F1030", issuer: "State Street", assetClass: "equity", region: "US", theme: null, trackedIndex: "S&P 500", terPct: 0.09, aumUsdM: 600000, domicile: "US", replication: "physical", distribution: "dist", ucits: false, sourceUrl: "https://example.com/spy" };

test("enrichment schema requires every listing and an HTTPS source", () => {
  assert.deepEqual(validateBatch({ items: [enriched] }, [first]), []);
  assert.match(validateBatch({ items: [] }, [first]).join(" "), /items|missing/);
  assert.match(validateBatch({ items: [{ ...enriched, sourceUrl: "http://example.com" }] }, [first]).join(" "), /sourceUrl/);
  assert.deepEqual(chunks(Array.from({ length: 41 }, (_, i) => i)).map((batch) => batch.length), [20,20,1]);
});

test("failed enrichment batch leaves it pending and later batch posts", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-enrich-test-")); let calls = 0; const posts = [];
  const items = Array.from({ length: 21 }, (_, i) => ({ ...first, listingKey: `NYSEARCA:E${i}`, symbol: `E${i}` }));
  const adapter = { name: "codex", run: async () => { if (++calls === 1) throw new Error("temporary failure"); return { text: JSON.stringify({ items: [{ ...enriched, listingKey: "NYSEARCA:E20" }] }) }; } };
  const request = async (url, init) => url.includes("/pending?") ? { ok: true, json: async () => ({ items }) } : (posts.push(JSON.parse(init.body)), { ok: true });
  try {
    const result = await execute(parseArgs(["--limit", "21", "--out-dir", outDir]), { adapter, env: { INGEST_TOKEN: "test" }, request, log: () => {} });
    assert.deepEqual(result, { batches: 2, failed: 1 });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].items[0].listingKey, "NYSEARCA:E20");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});
