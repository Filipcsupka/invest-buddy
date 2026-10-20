import { fetchLiveUsage } from "./claude-usage.mjs";

const number = (env, key, fallback) => {
  const value = Number(env[key] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be nonnegative`);
  return value;
};

/** Owner decision 2026-10-20: no token, call, USD or time-window caps. Only the kill switch and the real subscription limits stop a run. */
export const QUOTA_STOP_5H_PCT = 90;
export const QUOTA_STOP_7D_PCT = 90;
export const CODEX_QUOTA_STOP_PCT = 90;

const skipped = (status, reason) => ({ ok: false, status, reason });

export async function checkResearchCaps({ env = process.env, adapter = "claude", authSource = env.ANTHROPIC_API_KEY ? "api" : "subscription", codexQuota,
  liveUsage = () => fetchLiveUsage(env.CLAUDE_CODE_OAUTH_TOKEN) }) {
  if (env.RESEARCH_ENABLED !== "on") return skipped("killed", "RESEARCH_ENABLED is not on");
  if (adapter === "codex") return checkCodexQuota({ env, codexQuota });
  if (authSource === "subscription") return checkLiveResearchQuota({ env, liveUsage });
  return { ok: true, status: "ok", reason: null };
}

/** Stops only at the real five-hour and seven-day subscription limits. An unreadable quota (403, 429, timeout) does not stop the run. */
export async function checkLiveResearchQuota({ env = process.env, liveUsage = () => fetchLiveUsage(env.CLAUDE_CODE_OAUTH_TOKEN) }) {
  const result = await liveUsage();
  if (!result?.usage || ![result.usage.fiveHour?.pct, result.usage.sevenDay?.pct].every((pct) => Number.isFinite(pct) && pct >= 0 && pct <= 100))
    return { ok: true, status: "ok", reason: `live Claude quota unavailable: ${result?.unavailable ?? "invalid response"}; running anyway` };
  const fiveHour = number(env, "RESEARCH_QUOTA_STOP_5H_PCT", QUOTA_STOP_5H_PCT);
  const sevenDay = number(env, "RESEARCH_QUOTA_STOP_7D_PCT", QUOTA_STOP_7D_PCT);
  if (result.usage.fiveHour.pct >= fiveHour) return skipped("skipped_quota", `five-hour quota at ${result.usage.fiveHour.pct}%`);
  if (result.usage.sevenDay.pct >= sevenDay) return skipped("skipped_quota", `seven-day quota at ${result.usage.sevenDay.pct}%`);
  return { ok: true, status: "ok", reason: null };
}

/** `codexQuota` returns { pct } when `codex exec --json` has reported a rate limit, otherwise null. An unknown reading does not stop the run. */
export async function checkCodexQuota({ env = process.env, codexQuota }) {
  const reading = await codexQuota?.();
  if (reading && Number.isFinite(reading.pct) && reading.pct >= 0 && reading.pct <= 100 && reading.pct >= CODEX_QUOTA_STOP_PCT)
    return skipped("skipped_quota", `Codex rate limit at ${reading.pct}%`);
  return { ok: true, status: "ok", reason: null };
}
