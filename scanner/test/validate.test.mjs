// Run: node --test scanner/test/validate.test.mjs  (node 25 needs the file path, a bare directory fails)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePayload, validateTicker } from "../validate.mjs";

const sample = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "sample-payload.json"), "utf8"));

test("sample payload is valid", () => assert.deepEqual(validatePayload(sample()), []));

test("true without evidence is rejected", () => {
  const p = sample();
  p.tickers[0].evidence = p.tickers[0].evidence.filter((e) => e.claim !== "fundamentals.guidanceRaised");
  assert.match(validatePayload(p).join("\n"), /guidanceRaised/);
});

test("non-https evidence is rejected", () => {
  const p = sample();
  p.tickers[0].evidence[0].url = "http://example.com/x";
  assert.ok(validatePayload(p).length > 0);
});

test("unknown field is rejected", () => {
  const p = sample();
  p.tickers[0].price = 100;
  assert.match(validatePayload(p).join("\n"), /price: unknown field/);
});

test("missing macro, bad uuid and bad date are rejected", () => {
  const p = sample();
  delete p.macro; p.runId = "nope"; p.asOf = "2026-13-01";
  const e = validatePayload(p).join("\n");
  assert.match(e, /macro: required/);
  assert.match(e, /runId/);
  assert.match(e, /asOf/);
});

test("null booleans and null catalyst are valid", () => {
  const t = sample().tickers[2];
  assert.deepEqual(validateTicker(t), []);
});

test("duplicate symbol is rejected", () => {
  const p = sample();
  p.tickers.push(structuredClone(p.tickers[2]));
  assert.match(validatePayload(p).join("\n"), /duplicate/);
});
