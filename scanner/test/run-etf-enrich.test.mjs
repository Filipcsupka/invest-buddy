import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETAIL_HOLDINGS, chunks, detailPayload, execute, parseArgs, postDetails, validateBatch } from "../run-etf-enrich.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/eodhd-etf.json", import.meta.url)));
const first = { listingKey: "NYSEARCA:SPY", isin: null, symbol: "SPY", exchange: "NYSEARCA", name: "SPDR ETF" };
const enriched = { listingKey: first.listingKey, isin: "US78462F1030", issuer: "State Street", assetClass: "equity", region: "US", theme: null, trackedIndex: "S&P 500", terPct: 0.09, aumUsdM: 600000, domicile: "US", replication: "physical", distribution: "dist", ucits: false, ucitsHint: null, terGap: null, sourceUrl: "https://example.com/spy" };

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
    if (init.method === "POST") { (String(url).endsWith("/etf-detail") ? details : posts).push(JSON.parse(init.body)); return { ok: true }; }
    if (String(url).includes("/pending?")) return { ok: true, json: async () => ({ items }) };
    return ++vendorCalls === 1 ? { ok: false, status: 500 } : { ok: true, json: async () => fixture };
  };
  const details = [];
  try {
    const result = await execute(parseArgs(["--limit", "21", "--out-dir", outDir]), { env: { INGEST_TOKEN: "test", EODHD_API_KEY: "test" }, request, log: () => {} });
    assert.deepEqual(result, { batches: 2, failed: 1, calls: 20, budget: 15000, estimatedCalls: 210, deferred: 0 });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].items[0].listingKey, "NYSEARCA:E20");
    // The paid ETF_Data payload is stored once per fetched fund; the failed batch sends none.
    assert.equal(details.length, 1);
    assert.deepEqual(Object.keys(details[0]), ["listingKey", "vendorSymbol", "data"]);
    assert.equal(details[0].vendorSymbol, "E20.US");
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("a missing EODHD key fails the batch without an ingest write", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-enrich-test-")); const posts = [];
  const request = async (url, init = {}) => init.method === "POST" ? (posts.push(init.body), { ok: true }) : { ok: true, json: async () => ({ items: [first] }) };
  try {
    const result = await execute(parseArgs(["--out-dir", outDir]), { env: { INGEST_TOKEN: "test" }, request, log: () => {} });
    assert.deepEqual(result, { batches: 1, failed: 1, calls: 0, budget: 15000, estimatedCalls: 10, deferred: 0 });
    assert.equal(posts.length, 0);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});

test("detail payload keeps the complete paid response", () => {
  const holdings = Object.fromEntries(Array.from({ length: DETAIL_HOLDINGS + 3 }, (_, i) => [`H${i}.US`, { "Assets_%": i }]));
  const payload = detailPayload({ General: { Type: "ETF", ISIN: "US78462F1030", CurrencyCode: "USD", Description: "long" }, Technicals: { "52WeekHigh": 100 }, ETF_Data: { Holdings: holdings, Yield: 1 } });
  assert.equal(payload.General.Description, "long");
  assert.equal(payload.Technicals["52WeekHigh"], 100);
  assert.equal(Object.keys(payload.ETF_Data.Holdings).length, DETAIL_HOLDINGS + 3);
  assert.ok(payload.ETF_Data.Holdings[`H${DETAIL_HOLDINGS + 2}.US`]);
  assert.ok(payload.ETF_Data.Holdings["H0.US"]);
  assert.equal(detailPayload({ General: {} }), null);
});

test("one cached vendor response is stored for every matching listing", async () => {
  const rows = [first, { ...first, listingKey: "NYSE:SPY" }];
  const bodies = [];
  const count = await postDetails(rows, new Map([["SPY.US", fixture]]), {
    base: "http://localhost", token: "test", request: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; }, log: () => {},
  });
  assert.equal(count, 2);
  assert.deepEqual(bodies.map((body) => body.listingKey), rows.map((row) => row.listingKey));
});

test("daily call budget stops at unique symbols and leaves remaining rows pending", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "etf-enrich-budget-")); const urls = [];
  const items = Array.from({ length: 5 }, (_, i) => ({ ...first, listingKey: `NYSEARCA:E${i}`, symbol: `E${i}` }));
  const request = async (url, init = {}) => {
    urls.push(String(url));
    if (String(url).includes("/pending?")) return { ok: true, json: async () => ({ items }) };
    if (init.method === "POST") return { ok: true };
    return { ok: true, json: async () => fixture };
  };
  try {
    const opts = parseArgs(["--limit", "5", "--out-dir", outDir]);
    const result = await execute(opts, { env: { INGEST_TOKEN: "test", EODHD_API_KEY: "test", ETF_EODHD_DAILY_CALL_BUDGET: "20" }, request, log: () => {} });
    assert.deepEqual(result, { batches: 1, failed: 0, calls: 20, budget: 20, estimatedCalls: 20, deferred: 3 });
    assert.equal(urls.filter((url) => url.includes("eodhd.com")).length, 2);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
});
