/** One shared, conservative token ceiling for judge and ETF model calls in the current UTC month. */
export function monthlyTokenCap(env = process.env) {
  const cap = Number(env.AI_JUDGE_MONTHLY_TOKEN_CAP ?? "2000000");
  if (!Number.isSafeInteger(cap) || cap < 1) throw new Error("AI_JUDGE_MONTHLY_TOKEN_CAP must be a positive integer");
  return cap;
}
export function expectedTokens(promptChars, env = process.env) {
  const output = Number(env.AI_EXPECTED_OUTPUT_TOKENS ?? "30000");
  if (!Number.isSafeInteger(output) || output < 1) throw new Error("AI_EXPECTED_OUTPUT_TOKENS must be a positive integer");
  return Math.ceil(promptChars / 3) + output;
}
/** Ledger kinds the cap counts: judge and ETF research. Extraction calls are not counted. */
const CAPPED_KINDS = ["judge", "research"];
export function monthlyUsed(report, date = new Date()) {
  const month = date.toISOString().slice(0, 7);
  return CAPPED_KINDS.reduce((total, kind) => total + Object.entries(report?.tokensPerDayUtcByKind?.[kind] ?? {})
    .reduce((sum, [day, tokens]) => sum + (day.startsWith(month) && Number.isFinite(tokens) ? tokens : 0), 0), 0);
}
const dayTotals = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((tokens) => Number.isSafeInteger(tokens) && tokens >= 0);
export async function checkMonthlyBudget(baseUrl, token, expected, { env = process.env, request = fetch, now = new Date() } = {}) {
  const cap = monthlyTokenCap(env);
  if (expected > cap) throw new Error(`expected ${expected} tokens exceeds monthly cap ${cap}`);
  if (!token) throw new Error("INGEST_TOKEN is required for monthly token guard");
  const response = await request(`${baseUrl.replace(/\/$/, "")}/api/ingest/ai-budget`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`monthly AI usage unavailable: HTTP ${response.status}`);
  const report = await response.json();
  const byKind = report?.tokensPerDayUtcByKind;
  if (!byKind || typeof byKind !== "object" || Array.isArray(byKind) || !Object.values(byKind).every(dayTotals)) throw new Error("monthly AI usage malformed");
  const used = monthlyUsed(report, now);
  if (used + expected > cap) throw new Error(`monthly token cap: ${used} used + ${expected} expected > ${cap}`);
  return { used, expected, cap };
}
