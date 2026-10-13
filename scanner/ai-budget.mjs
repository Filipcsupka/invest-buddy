import { randomUUID } from "node:crypto";

const url = (baseUrl) => `${baseUrl}/api/ingest/ai-budget`;
async function call(baseUrl, token, body) {
  const res = await fetch(url(baseUrl), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`AI ledger unavailable: HTTP ${res.status}`);
  return res.json();
}
/** Create a ledger row before each call. Accounting does not gate model use. */
export async function reserveBudget(baseUrl, token, kind, model = "default", agent = "claude", caps = undefined, authSourceOverride = undefined) {
  const id = randomUUID();
  const authSource = authSourceOverride ?? (agent === "codex" ? "codex" : process.env.ANTHROPIC_API_KEY ? "api" : "subscription");
  try { const result = await call(baseUrl, token, { action: "reserve", id, kind, agent, authSource, model, ...(caps ? { caps } : {}) }); return result.recorded === false ? null : id; }
  catch { return null; }
}
export async function finishBudget(baseUrl, token, id, usage, costUsd, cutoff = null) {
  const tokens = usage?.inputTokens == null || usage?.outputTokens == null ? null : usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
  try { await call(baseUrl, token, { action: "finish", id, tokens, usd: costUsd ?? null, status: cutoff?.status ?? "ok", window: cutoff?.window ?? null, resetAt: cutoff?.resetAt ?? null, resetHint: cutoff?.resetHint ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, cacheReadTokens: usage?.cacheReadTokens ?? null, cacheCreationTokens: usage?.cacheCreationTokens ?? null }); return true; }
  catch { return false; }
}
export function dailyTokenCeiling(env = process.env) {
  const value = env.AI_DAILY_TOKEN_CEILING ?? "0";
  const ceiling = Number(value);
  if (!Number.isSafeInteger(ceiling) || ceiling < 0) throw new Error("AI_DAILY_TOKEN_CEILING must be a nonnegative integer");
  return ceiling;
}
export async function dailyTokens(baseUrl, token) {
  const res = await fetch(`${url(baseUrl)}?report=daily`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`daily AI usage unavailable: HTTP ${res.status}`);
  const body = await res.json();
  if (!Number.isSafeInteger(body.tokens) || body.tokens < 0) throw new Error("daily AI usage malformed");
  return body.tokens;
}
