import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveBudget, finishBudget } from "../ai-budget.mjs";

test("an unavailable ledger does not block the model path", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status: 503 });
    assert.equal(await reserveBudget("http://x", "token", "extract", "haiku"), null);
  } finally { globalThis.fetch = original; }
});

test("a completed call reports token and dollar usage", async () => {
  const original = globalThis.fetch; let body;
  try {
    globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return Response.json({ finished: true }); };
    await finishBudget("http://x", "token", "123", { inputTokens: 5, outputTokens: 7, cacheReadTokens: 3, cacheCreationTokens: 2 }, 0.12);
    assert.deepEqual(body, { action: "finish", id: "123", tokens: 17, usd: 0.12, status: "ok", window: null, resetAt: null, resetHint: null, inputTokens: 5, outputTokens: 7, cacheReadTokens: 3, cacheCreationTokens: 2 });
  } finally { globalThis.fetch = original; }
});
