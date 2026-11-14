import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enrichEodhd, mapFundamentals, vendorSymbol } from "../eodhd-etf-enrich.mjs";
import { validateBatch } from "../run-etf-enrich.mjs";
import { execute, parseArgs } from "../run-etf-enrich.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/eodhd-etf.json", import.meta.url)));
const real = (name) => JSON.parse(readFileSync(new URL(`../../src/data-providers/eodhd/fixtures/real/${name}`, import.meta.url))).response;
const us = { listingKey: "NYSEARCA:VTI", isin: null, symbol: "VTI", exchange: "NYSEARCA" };

test("maps recorded ETF fields and validates the ingest payload", () => {
  const row = mapFundamentals(us, vendorSymbol(us), fixture);
  assert.equal(row.terPct, 0.03);
  assert.equal(row.aumUsdM, 1800000);
  assert.equal(row.assetClass, "equity");
  assert.equal(row.region, "North America");
  assert.equal(row.holdingsCount, 3600);
  assert.equal(row.ucits, null);
  assert.equal(row.ucitsHint, null);
  assert.equal(row.terGap, null);
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

test("maps sampled XETRA ETF fees without inventing USD assets or UCITS status", () => {
  for (const [symbol, fee, holdings] of [["EXSA", 0.1918, 600], ["VUSA", 0.0688, 10]]) {
    const data = real(`etf-${symbol.toLowerCase()}.json`);
    const row = { listingKey: data.ETF_Data.ISIN, isin: data.ETF_Data.ISIN, symbol, exchange: "XETR", vendorSymbol: `${symbol}.XETRA` };
    const mapped = mapFundamentals(row, row.vendorSymbol, data);
    assert.equal(mapped.terPct, fee);
    assert.equal(mapped.holdingsCount, holdings);
    assert.equal(mapped.aumUsdM, null);
    assert.equal(mapped.ucits, null);
  }
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
  assert.equal(ambiguous.terGap, "ter_ambiguous");
  const conflicting = mapFundamentals(us, "VTI.US", { ...fixture, ETF_Data: { ...fixture.ETF_Data, Ongoing_Charge: "0.2" } });
  assert.equal(conflicting.terPct, null);
  const tinyOngoing = mapFundamentals(us, "VTI.US", { ...fixture, ETF_Data: { ...fixture.ETF_Data, NetExpenseRatio: null, Ongoing_Charge: "0.003" } });
  assert.equal(tinyOngoing.terPct, null);
});

test("category, region and payout labels map; the UCITS hint is the catalog's, never confirmation", () => {
  const eu = { listingKey: "IE00TEST0001", isin: "IE00TEST0001", name: "Sample UCITS ETF", exchange: "XETR", ucitsHint: true };
  for (const [category, expected] of [["Global Equity", "equity"], ["Government Bond", "bond"], ["Gold Commodity", "commodity"], ["Balanced Multi Asset", "multi_asset"], ["Money Market", "money_market"], ["Other", "other"], ["Specialty", null]]) {
    const mapped = mapFundamentals(eu, "TEST.XETRA", { General: { Category: category }, ETF_Data: { World_Regions: { Europe: { "Equity_%": 55 }, Asia: { "Equity_%": 45 } }, Dividend_Paying_Frequency: "Vierteljährlich" } });
    assert.equal(mapped.assetClass, expected, category);
    assert.equal(mapped.region, "global");
    assert.equal(mapped.distribution, "dist");
    assert.equal(mapped.ucits, null);
    assert.equal(mapped.ucitsHint, true);
  }
  assert.equal(mapFundamentals(eu, "TEST.XETRA", { ETF_Data: { Dividend_Paying_Frequency: "Thesaurierend" } }).distribution, "acc");
});

test("the mapper echoes the catalog UCITS hint and never derives one from name or ISIN", () => {
  const named = { listingKey: "IE00TEST0002", isin: "IE00TEST0002", name: "Sample UCITS ETF", exchange: "XETR" };
  assert.equal(mapFundamentals(named, "TEST.XETRA", { ETF_Data: {} }).ucitsHint, null);
  assert.equal(mapFundamentals({ ...named, ucitsHint: false }, "TEST.XETRA", { ETF_Data: {} }).ucitsHint, false);
});

test("an unmatched Category leaves the class to Asset_Allocation", () => {
  const stock = { Asset_Allocation: { "Stock US": { "Net_Assets_%": 99 } } };
  const bonds = { Asset_Allocation: { Bond: { "Net_Assets_%": 97 } } };
  for (const category of ["Large Blend", "Foreign Large Blend", "Technology", "Real Estate", "NA"]) assert.equal(mapFundamentals(us, "VTI.US", { General: { Category: category }, ETF_Data: stock }).assetClass, "equity", category);
  assert.equal(mapFundamentals(us, "VTI.US", { General: { Category: "Long Government" }, ETF_Data: bonds }).assetClass, "bond");
  assert.equal(mapFundamentals(us, "VTI.US", { General: { Category: "Ultrashort" }, ETF_Data: bonds }).assetClass, "bond");
});

test("category words match whole words, allocation before equity, equity and bond before commodity or cash words", () => {
  const cls = (category, allocation = {}) => mapFundamentals(us, "VTI.US", { General: { Category: category }, ETF_Data: { Asset_Allocation: allocation } }).assetClass;
  assert.equal(cls("Cash Flow Leaders", { "Stock US": { "Net_Assets_%": 98 } }), "equity");
  assert.equal(cls("Goldman Sachs Equity"), "equity");
  assert.equal(cls("Equity Precious Metals"), "equity");
  assert.equal(cls("Allocation--50% to 70% Equity"), "multi_asset");
  assert.equal(cls("EUR Moderate Allocation - Global"), "multi_asset");
  assert.equal(cls("Intermediate Core Bond"), "bond");
  assert.equal(cls("Commodities Broad Basket"), "commodity");
  assert.equal(cls("Precious Metals"), "commodity");
  assert.equal(cls("EUR Money Market"), "money_market");
  assert.equal(cls("Stockholm Small Caps"), null);
});

test("region uses Fund_% when a bond fund reports Equity_% 0", () => {
  const regions = { "North America": { "Equity_%": 0, "Fund_%": 80 }, Europe: { "Equity_%": 0, "Fund_%": 20 } };
  assert.equal(mapFundamentals(us, "VTI.US", { ETF_Data: { World_Regions: regions } }).region, "North America");
  assert.equal(mapFundamentals(us, "VTI.US", { ETF_Data: { World_Regions: { Europe: { "Equity_%": 0, "Fund_%": 0 } } } }).region, null);
});

test("stored dividend history marks a distributing class only when the payout label is silent", () => {
  const row = { ...us, dividendHistory: [{ value: "0.42" }] };
  assert.equal(mapFundamentals(row, "VTI.US", { ETF_Data: { Dividend_Paying_Frequency: "NA" } }).distribution, "dist");
  assert.equal(mapFundamentals(row, "VTI.US", { ETF_Data: { Dividend_Paying_Frequency: "Accumulating" } }).distribution, "acc");
  assert.equal(mapFundamentals({ ...us, dividendHistory: [{ value: 0 }] }, "VTI.US", { ETF_Data: {} }).distribution, null);
  // Fundamentals carry no dividend list; a Dividends key in the response is ignored.
  assert.equal(mapFundamentals(us, "VTI.US", { ETF_Data: { Dividends: [{ amount: 1 }] } }).distribution, null);
});

test("the TER gap is set only when TER stays unknown", () => {
  const resolved = mapFundamentals(us, "VTI.US", { ETF_Data: { NetExpenseRatio: 0.02, Ongoing_Charge: 2 } });
  assert.equal(resolved.terPct, 2);
  assert.equal(resolved.terGap, null);
});

test("a lone NetExpenseRatio above 0.1 is read as a percent (live 2026-11-06 samples)", () => {
  const ter = (value) => mapFundamentals(us, "VTI.US", { ...fixture, ETF_Data: { ...fixture.ETF_Data, NetExpenseRatio: value, Ongoing_Charge: null } }).terPct;
  assert.equal(ter(0.381), 0.381); // QHY.US, 0.38% fund
  assert.equal(ter(0.1208), 0.1208); // VCRM.US, 0.12% fund
  assert.equal(ter(0.0009), 0.09); // SPY.US, fraction
  assert.equal(ter(0.1), null); // 10% or 0.1%
  assert.equal(ter(0.05), null); // 5% or 0.05%
  assert.equal(ter(12), null);
});

test("runner stops at the EODHD call cap and posts the completed prefix", async () => {
  const rows = ["AAA", "BBB", "CCC"].map((symbol) => ({ ...us, listingKey: `NYSEARCA:${symbol}`, symbol }));
  const posts = []; let vendorCalls = 0;
  const request = async (url, options = {}) => {
    if (options.method === "POST") { posts.push(JSON.parse(options.body)); return { ok: true }; }
    if (String(url).includes("/pending?")) return { ok: true, json: async () => ({ items: rows }) };
    vendorCalls++; return { ok: true, json: async () => fixture };
  };
  const result = await execute(parseArgs(["--limit", "3"], {}), {
    env: { ETF_EODHD_MAX_CALLS: "20", INGEST_TOKEN: "fixture", EODHD_API_KEY: "fixture" }, request, log: () => {},
  });
  assert.deepEqual(result, { batches: 1, failed: 0, calls: 20, budget: 20, estimatedCalls: 20, deferred: 1 });
  assert.equal(vendorCalls, 2);
  assert.deepEqual(posts[0].items.map((row) => row.listingKey), rows.slice(0, 2).map((row) => row.listingKey));
});

test("runner rejects an invalid EODHD call cap", async () => {
  await assert.rejects(() => execute(parseArgs([], {}), {
    env: { ETF_EODHD_MAX_CALLS: "12", INGEST_TOKEN: "fixture" }, request: async () => { throw new Error("unexpected request"); },
  }), /ETF_EODHD_MAX_CALLS/);
});

test("runner dry run needs no vendor key and makes no vendor or ingest write", async () => {
  const urls = [];
  const request = async (url) => { urls.push(String(url)); return { ok: true, json: async () => ({ items: [us] }) }; };
  const result = await execute(parseArgs(["--dry-run"], {}), {
    env: { INGEST_TOKEN: "fixture" }, request, log: () => {},
  });
  assert.deepEqual(result, { batches: 1, failed: 0, calls: 0, budget: 30000, estimatedCalls: 10, deferred: 0 });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /pending\?limit=20$/);
});
