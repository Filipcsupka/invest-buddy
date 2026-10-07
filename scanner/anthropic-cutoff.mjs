import { usageFromEnvelope } from "./extraction-log.mjs";

export const CUTOFF_EXIT_CODE = 5;

export function attachClaudeUsage(error, env) {
  if (env?.usage) error.usage = usageFromEnvelope(env);
  if (typeof env?.total_cost_usd === "number") error.costUsd = env.total_cost_usd;
  return error;
}

export function attachCliUsage(error) {
  if (typeof error?.stdout === "string") {
    try { return attachClaudeUsage(error, JSON.parse(error.stdout)); } catch { /* stderr only */ }
  }
  return error;
}

// Claude emits either a JSON error result or a nonzero exit with text on stderr.
export function anthropicCutoff(value) {
  const envelope = typeof value === "object" && value !== null ? value : {};
  const parts = [typeof value === "string" ? value : "", envelope.message, envelope.stderr, envelope.stdout, envelope.result, envelope.subtype, envelope.error?.message, envelope.error?.type, envelope.error?.code, envelope.type, envelope.code, envelope.status].filter(Boolean);
  const parsedEnvelopes = [];
  for (const part of [envelope.stdout, envelope.stderr]) {
    if (typeof part !== "string") continue;
    try { const parsed = JSON.parse(part); parsedEnvelopes.push(parsed); parts.push(parsed.result, parsed.subtype, parsed.error?.message, parsed.error?.type, parsed.error?.code, parsed.type, parsed.code, parsed.status); } catch { /* CLI text */ }
  }
  const message = parts.filter(Boolean).join(" ").replace(/_/g, " ");
  if (!/(?:usage\s*limit|five.?hour|5.?hour|weekly\s*limit|week(?:ly)?\s*usage|rate.?limit|too many requests|\b429\b|overloaded|quota|capacity|limit reached|you.ve hit your limit)/i.test(message)) return null;
  const window = /(?:weekly|week(?:ly)?\s*usage)/i.test(message) ? "weekly" : /(?:five.?hour|5.?hour)/i.test(message) ? "5h" : /overloaded|capacity/i.test(message) ? "overloaded" : /rate.?limit|too many requests|\b429\b/i.test(message) ? "rate limit" : "unknown";
  const resetSource = [envelope, ...parsedEnvelopes].find((item) => item.reset_at ?? item.resetAt ?? item.error?.reset_at ?? item.error?.resetAt) ?? envelope;
  const explicit = resetSource.reset_at ?? resetSource.resetAt ?? resetSource.error?.reset_at ?? resetSource.error?.resetAt;
  const match = message.match(/(?:resets?|try again|retry after)(?:\s+(?:at|on|in|after))?\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})|\d+\s*(?:minutes?|hours?|days?)|\d{1,2}(?::\d{2})?\s*(?:am|pm)(?:\s+UTC)?)/i);
  const raw = explicit ?? match?.[1];
  let resetAt = null;
  if (raw != null) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) resetAt = date.toISOString();
    else {
      const relative = String(raw).match(/^(\d+)\s*(minutes?|hours?|days?)/i);
      if (relative) resetAt = new Date(Date.now() + Number(relative[1]) * ({ minute: 60_000, hour: 3_600_000, day: 86_400_000 }[relative[2].toLowerCase().replace(/s$/, "")])).toISOString();
    }
  }
  return { window, resetAt, resetHint: resetAt ? null : raw == null ? null : String(raw) };
}

export function cutoffError(value) {
  const cutoff = anthropicCutoff(value);
  if (!cutoff) return null;
  let env = value;
  if (typeof value?.stdout === "string") { try { env = JSON.parse(value.stdout); } catch { /* stderr only */ } }
  return attachClaudeUsage(Object.assign(new Error("Anthropic usage cutoff"), { cutoff, exitCode: CUTOFF_EXIT_CODE }), env);
}

export const cutoffLine = (cutoff, tickers) => `ANTHROPIC CUTOFF: ${cutoff.window} resets ${cutoff.resetAt ?? cutoff.resetHint ?? "unknown"} after ${tickers} tickers`;
