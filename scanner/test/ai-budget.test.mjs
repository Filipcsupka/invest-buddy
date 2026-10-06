import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveBudget, finishBudget } from "../ai-budget.mjs";

test("a denied monthly reservation stops the model path with exit code 4", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ allowed: false, cap: { tokens: 1, usd: 0.01 } }, { status: 429 });
    await assert.rejects(reserveBudget("http://x", "token", "extract", 0.5), (e) => e.exitCode === 4 && /monthly AI budget reached/.test(e.message));
  } finally { globalThis.fetch = original; }
});

test("a completed call reports token and dollar usage", async () => {
  const original = globalThis.fetch; let body;
  try {
    globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return Response.json({ finished: true }); };
    await finishBudget("http://x", "token", "123", { inputTokens: 5, outputTokens: 7, cacheReadTokens: 3, cacheCreationTokens: 2 }, 0.12);
    assert.deepEqual(body, { action: "finish", id: "123", tokens: 17, usd: 0.12 });
  } finally { globalThis.fetch = original; }
});
