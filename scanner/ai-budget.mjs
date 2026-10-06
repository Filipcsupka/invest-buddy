import { randomUUID } from "node:crypto";

export class BudgetExceeded extends Error { constructor(message) { super(message); this.exitCode = 4; } }
const url = (baseUrl) => `${baseUrl}/api/ingest/ai-budget`;
async function call(baseUrl, token, body) {
  const res = await fetch(url(baseUrl), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (res.status === 429) throw new BudgetExceeded(`monthly AI budget reached: ${JSON.stringify(await res.json())}`);
  if (!res.ok) throw new Error(`AI budget unavailable: HTTP ${res.status}`);
  return res.json();
}
/** Reserve before each model call. Missing usage is charged at the reservation so failures cannot bypass the cap. */
export async function reserveBudget(baseUrl, token, kind, usd, tokens = 20000) {
  const id = randomUUID();
  await call(baseUrl, token, { action: "reserve", id, kind, tokens, usd });
  return id;
}
export async function finishBudget(baseUrl, token, id, usage, costUsd) {
  const tokens = usage?.inputTokens == null || usage?.outputTokens == null ? null : usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
  await call(baseUrl, token, { action: "finish", id, tokens, usd: costUsd ?? null });
}
