import { test } from "node:test";
import assert from "node:assert/strict";
import { anthropicCutoff, cutoffError, cutoffLine } from "../anthropic-cutoff.mjs";

test("recognizes subscription windows, rate limits, and overload from CLI text and fields", () => {
  assert.deepEqual(anthropicCutoff({ result: "You've hit your 5-hour usage limit. Resets at 2026-10-07T15:00:00Z" }), { window: "5h", resetAt: "2026-10-07T15:00:00.000Z", resetHint: null });
  assert.deepEqual(anthropicCutoff({ error: { type: "weekly_usage_limit", message: "Weekly limit reached", reset_at: "2026-10-11T00:00:00Z" } }), { window: "weekly", resetAt: "2026-10-11T00:00:00.000Z", resetHint: null });
  assert.deepEqual(anthropicCutoff({ stdout: JSON.stringify({ error: { type: "rate_limit_error", reset_at: "2026-10-07T15:00:00Z" } }) }), { window: "rate limit", resetAt: "2026-10-07T15:00:00.000Z", resetHint: null });
  assert.equal(anthropicCutoff({ result: "Rate limit exceeded. Retry after 2026-10-07T15:00:00Z" }).resetAt, "2026-10-07T15:00:00.000Z");
  assert.equal(anthropicCutoff({ result: "Usage limit reached; resets at 3pm" }).resetHint, "3pm");
  assert.equal(anthropicCutoff({ result: "Usage limit reached" }).window, "unknown");
  assert.equal(anthropicCutoff({ stderr: "HTTP 429 too many requests" }).window, "rate limit");
  assert.equal(anthropicCutoff({ stdout: JSON.stringify({ error: { type: "overloaded_error" } }) }).window, "overloaded");
  assert.equal(anthropicCutoff({ message: "Claude timed out" }), null);
  assert.equal(cutoffError({ status: 429 }).exitCode, 5);
  assert.equal(cutoffLine({ window: "weekly", resetAt: null }, 3), "ANTHROPIC CUTOFF: weekly resets unknown after 3 tickers");
});
