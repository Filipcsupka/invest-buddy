import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enrichEodhd, mapFundamentals, vendorSymbol } from "../eodhd-etf-enrich.mjs";
import { validateBatch } from "../run-etf-enrich.mjs";
import { execute, parseArgs } from "../run-etf-enrich.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/eodhd-etf.json", import.meta.url)));
const us = { listingKey: "NYSEARCA:VTI", isin: null, symbol: "VTI", exchange: "NYSEARCA" };

test("maps recorded ETF fields and validates the ingest payload", () => {
  const row = mapFundamentals(us, vendorSymbol(us), fixture);
  assert.equal(row.terPct, 0.03);
  assert.equal(row.aumUsdM, 1800000);
  assert.equal(row.assetClass, "equity");
  assert.equal(row.region, null);
  assert.equal(row.holdingsCount, 3600);
  assert.equal(row.ucits, null);
  assert.deepEqual(validateBatch({ items: [row] }, [us]), []);
});

test("ISIN symbol wins; absent UCITS data stays null and incomplete", () => {
  const eu = { listingKey: "IE00TEST0001", isin: "IE00TEST0001", symbol: "TEST", exchange: "XETR", vendorSymbol: "TEST.XETRA" };
  assert.equal(vendorSymbol(eu), "TEST.XETRA");
  const row = mapFundamentals(eu, vendorSymbol(eu), { General: { CurrencyCode: "EUR" }, ETF_Data: { Ongoing_Charge: "0.2", Company_Name: "Issuer" } });
  assert.equal(row.terPct, 0.2);
  assert.equal(row.aumUsdM, null);
  assert.equal(row.assetClass, null);
  assert.equal(row.ucits, null);
  assert.deepEqual(validateBatch({ items: [row] }, [eu]), []);
  const unmapped = mapFundamentals({ ...eu, vendorSymbol: null }, null, undefined);
  assert.equal(unmapped.sourceUrl, null);
  assert.equal(unmapped.issuer, null);
});

test("dry run makes no vendor calls; duplicate symbols share one paid call", async () => {
  const rows = [us, { ...us, listingKey: "NYSE:VTI" }];
  let calls = 0;
  const request = async () => { calls++; return { ok: true, json: async () => fixture }; };
  assert.equal((await enrichEodhd(rows, { dryRun: true, request, log: () => {} })).calls, 10);
  assert.equal(calls, 0);
  const result = await enrichEodhd(rows, { apiKey: "fixture", request });
  assert.equal(result.calls, 10);
  assert.equal(calls, 1);
  assert.equal(result.items.length, 2);
});

test("one invalid vendor identity does not discard valid rows", async () => {
  const rows = [us, { ...us, listingKey: "NYSEARCA:BAD", symbol: "BAD", isin: "US0000000001" }, { ...us, listingKey: "NYSEARCA:NOTE", symbol: "NOTE" }];
  const request = async (url) => ({ ok: true, json: async () => String(url).includes("NOTE.US") ? { ...fixture, General: { ...fixture.General, Type: "ETN" } } : fixture });
  const result = await enrichEodhd(rows, { apiKey: "fixture", request, log: () => {} });
  assert.equal(result.items[0].issuer, "Vanguard");
  assert.equal(result.items[1].issuer, null);
  assert.equal(result.items[1].sourceUrl?.includes("BAD.US"), true);
  assert.equal(result.items[2].issuer, null);
  assert.deepEqual(validateBatch({ items: result.items }, rows), []);
});

test("ambiguous or conflicting TER units remain incomplete", () => {
  const ambiguous = mapFundamentals(us, "VTI.US", { ...fixture, ETF_Data: { ...fixture.ETF_Data, NetExpenseRatio: "0.025" } });
  assert.equal(ambiguous.terPct, null);
  const conflicting = mapFundamentals(us, "VTI.US", { ...fixture, ETF_Data: { ...fixture.ETF_Data, Ongoing_Charge: "0.2" } });
  assert.equal(conflicting.terPct, null);
  const tinyOngoing = mapFundamentals(us, "VTI.US", { ...fixture, ETF_Data: { ...fixture.ETF_Data, NetExpenseRatio: null, Ongoing_Charge: "0.003" } });
  assert.equal(tinyOngoing.terPct, null);
});

test("runner stops at the EODHD call cap and posts the completed prefix", async () => {
  const rows = ["AAA", "BBB", "CCC"].map((symbol) => ({ ...us, listingKey: `NYSEARCA:${symbol}`, symbol }));
  const posts = []; let vendorCalls = 0;
  const request = async (url, options = {}) => {
    if (options.method === "POST") { posts.push(JSON.parse(options.body)); return { ok: true }; }
    if (String(url).includes("/pending?")) return { ok: true, json: async () => ({ items: rows }) };
    vendorCalls++; return { ok: true, json: async () => fixture };
  };
  const result = await execute(parseArgs(["--limit", "3"], { ETF_ENRICH_SOURCE: "eodhd" }), {
    env: { ETF_ENRICH_SOURCE: "eodhd", ETF_EODHD_MAX_CALLS: "20", INGEST_TOKEN: "fixture", EODHD_API_KEY: "fixture" }, request, log: () => {},
  });
  assert.deepEqual(result, { batches: 1, failed: 0 });
  assert.equal(vendorCalls, 2);
  assert.deepEqual(posts[0].items.map((row) => row.listingKey), rows.slice(0, 2).map((row) => row.listingKey));
});

test("runner rejects an invalid EODHD call cap", async () => {
  await assert.rejects(() => execute(parseArgs([], { ETF_ENRICH_SOURCE: "eodhd" }), {
    env: { ETF_ENRICH_SOURCE: "eodhd", ETF_EODHD_MAX_CALLS: "12", INGEST_TOKEN: "fixture" }, request: async () => { throw new Error("unexpected request"); },
  }), /ETF_EODHD_MAX_CALLS/);
});

test("runner dry run needs no vendor key and makes no vendor or ingest write", async () => {
  const urls = [];
  const request = async (url) => { urls.push(String(url)); return { ok: true, json: async () => ({ items: [us] }) }; };
  const result = await execute(parseArgs(["--dry-run"], { ETF_ENRICH_SOURCE: "eodhd" }), {
    env: { ETF_ENRICH_SOURCE: "eodhd", INGEST_TOKEN: "fixture" }, request, log: () => {},
  });
  assert.deepEqual(result, { batches: 1, failed: 0 });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /pending\?limit=20$/);
});
