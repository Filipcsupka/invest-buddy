import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, inputHash, usageFromEnvelope, alreadyExtracted, recordRun } from "../extraction-log.mjs";

const bundle = () => ({ symbol: "NVDA", generatedAt: "2026-10-05T10:00:00Z", since: "2026-06-07", documents: [
  { id: 2, url: "https://sec.gov/b", source: "edgar", docType: "8-K", publishedAt: "2026-09-01T00:00:00.000Z", excerpt: "B text" },
  { id: 1, url: "https://sec.gov/a", source: "edgar", docType: "EX-99.1", publishedAt: "2026-08-27T00:00:00.000Z", excerpt: "A text" }], facts: [{ key: "k2", asOf: "2026-10-01", value: { b: 1, a: 2 }, documentIds: [1] }, { key: "k1", asOf: "2026-10-01", value: 3, documentIds: [] }] });
const args = (b) => ({ bundle: b, prompt: "prompt v1", agent: "claude", model: "haiku" });

test("canonical sorts object keys", () => assert.equal(canonical({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}'));
test("hash ignores generatedAt, since and row order", () => {
  const a = bundle(); const b = bundle();
  b.generatedAt = "2026-10-06T00:00:00Z"; b.since = "2026-06-08"; b.documents.reverse(); b.facts.reverse(); b.facts.find((f) => f.key === "k2").value = { a: 2, b: 1 };
  assert.equal(inputHash(args(a)), inputHash(args(b)));
  assert.match(inputHash(args(a)), /^[0-9a-f]{64}$/);
});
test("hash changes with excerpt, prompt, agent or model", () => {
  const base = inputHash(args(bundle()));
  const edited = bundle(); edited.documents[0].excerpt += "!";
  assert.notEqual(inputHash(args(edited)), base);
  assert.notEqual(inputHash({ ...args(bundle()), prompt: "prompt v2" }), base);
  assert.notEqual(inputHash({ ...args(bundle()), agent: "codex" }), base);
  assert.notEqual(inputHash({ ...args(bundle()), model: "sonnet" }), base);
});
test("usage maps the Claude envelope and leaves gaps null", () => {
  assert.deepEqual(usageFromEnvelope({ num_turns: 1, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } }), { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 40, turns: 1 });
  assert.deepEqual(usageFromEnvelope({}), { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null, turns: null });
});
test("skip check and record use the route, and failures do not throw", async () => {
  const calls = []; const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push([String(url), init.method]); return new Response(JSON.stringify({ skip: true }), { status: 200 }); };
  try {
    assert.equal(await alreadyExtracted("http://x", "t", { symbol: "NVDA", agent: "claude", inputHash: "a".repeat(64) }), true);
    await recordRun("http://x", "t", { symbol: "NVDA" });
    assert.match(calls[0][0], /extraction-runs\?symbol=NVDA&agent=claude&inputHash=a{64}$/);
    assert.equal(calls[1][1], "POST");
    globalThis.fetch = async () => { throw new Error("down"); };
    await assert.rejects(alreadyExtracted("http://x", "t", { symbol: "NVDA", agent: "claude", inputHash: "a" }), /down/);
    const logs = []; await recordRun("http://x", "t", { symbol: "NVDA" }, (m) => logs.push(m)); assert.equal(logs.length, 1);
  } finally { globalThis.fetch = real; }
});
test("hash changes when a document's displayAllowed flag changes", () => {
  const base = inputHash(args(bundle()));
  const flagged = bundle(); flagged.documents[0].displayAllowed = true;
  assert.notEqual(inputHash(args(flagged)), base);
});
