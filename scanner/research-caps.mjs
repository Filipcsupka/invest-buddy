import { dailyTokenCeiling } from "./ai-budget.mjs";
import { fetchLiveUsage } from "./claude-usage.mjs";

const number = (env, key, fallback) => {
  const value = Number(env[key] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be nonnegative`);
  return value;
};

export function researchLimits(env, type, now = new Date()) {
  const clock = bratislavaClock(now);
  const sundayWeekly = type === "weekly" && new Date(`${clock.day}T12:00:00Z`).getUTCDay() === 0;
  return {
    monthlyTokens: number(env, "RESEARCH_MONTHLY_TOKENS", 12_000_000),
    monthlyUsd: number(env, "RESEARCH_MONTHLY_USD", 0),
    dailyCalls: number(env, "RESEARCH_DAILY_CALLS", 4) + (sundayWeekly ? 3 : 0),
    dailyTokens: number(env, "RESEARCH_DAILY_TOKENS", 600_000),
    sharedDailyTokens: dailyTokenCeiling(env),
  };
}

export function bratislavaClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const OVERRIDE_DEFAULTS = { runCalls: 3, dailyCalls: 3, monthlyCalls: 20 };

/** Opt-in only: RESEARCH_QUOTA_UNKNOWN_OVERRIDE=on. Anything else, including unset, is off. */
export const overrideOn = (env) => env.RESEARCH_QUOTA_UNKNOWN_OVERRIDE === "on";

export function overrideLimits(env) {
  return {
    runCalls: number(env, "RESEARCH_OVERRIDE_RUN_CALLS", OVERRIDE_DEFAULTS.runCalls),
    dailyCalls: number(env, "RESEARCH_OVERRIDE_DAILY_CALLS", OVERRIDE_DEFAULTS.dailyCalls),
    monthlyCalls: number(env, "RESEARCH_OVERRIDE_MONTHLY_CALLS", OVERRIDE_DEFAULTS.monthlyCalls),
  };
}

/** Hard call caps for a run that goes ahead without a quota reading. Counts come from our own tables; unreadable counts stop the run. */
export function checkOverrideCaps(env, usage, runCalls) {
  let limits;
  try { limits = overrideLimits(env); } catch (error) { return skipped("skipped_quota", `quota override caps invalid: ${error.message}`); }
  if (![usage?.dailyCalls, usage?.monthlyCalls, runCalls].every((n) => Number.isFinite(n) && n >= 0))
    return skipped("skipped_quota", "quota override call counts are unreadable");
  if (runCalls >= limits.runCalls) return skipped("skipped_quota", "quota override per-run call cap reached");
  if (usage.dailyCalls >= limits.dailyCalls) return skipped("skipped_quota", "quota override daily call cap reached");
  if (usage.monthlyCalls >= limits.monthlyCalls) return skipped("skipped_quota", "quota override monthly call cap reached");
  return null;
}

export const CODEX_DAILY_CALLS = 2;
const codexDailyCalls = (env) => number(env, "RESEARCH_CODEX_DAILY_CALLS", CODEX_DAILY_CALLS);
export const CODEX_QUOTA_STOP_PCT = 50;

const skipped = (status, reason) => ({ ok: false, status, reason });
const withinWindow = (minute, window) => {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(window);
  if (!match) throw new Error("RESEARCH_WINDOW must be HH:MM-HH:MM");
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (start >= end || end > 1440 || Number(match[2]) > 59 || Number(match[4]) > 59) throw new Error("RESEARCH_WINDOW is invalid");
  return minute >= start && minute < end;
};

/** Usage values are totals from completed and reserved calls for the local calendar day/month. */
export async function checkResearchCaps({ env = process.env, now = new Date(), type, manual = false,
  authSource = env.ANTHROPIC_API_KEY ? "api" : "subscription", adapter = "claude", codexQuota, usage, runCalls = 0, liveUsage = () => fetchLiveUsage(env.CLAUDE_CODE_OAUTH_TOKEN) }) {
  if (env.RESEARCH_ENABLED !== "on") return skipped("killed", "RESEARCH_ENABLED is not on");
  const clock = bratislavaClock(now);
  // Codex never gets the manual deep-dive exemption: its account is shared with the owner's own agents.
  if (!(manual && type === "deepdive" && adapter !== "codex") && !withinWindow(clock.minute, env.RESEARCH_WINDOW ?? "00:00-07:00"))
    return skipped("skipped_window", "outside research window");
  if (!usage || usage.day !== clock.day || usage.month !== clock.day.slice(0, 7) ||
      ["monthlyTokens", "monthlyUsd", "dailyCalls", "dailyTokens", "sharedDailyTokens"].some((key) => !Number.isFinite(usage[key]) || usage[key] < 0))
    return skipped("skipped_cap", "research usage is unavailable for the current day and month");
  const limits = researchLimits(env, type, now);
  if (usage.monthlyTokens >= limits.monthlyTokens)
    return skipped("skipped_cap", "monthly research token cap reached");
  if (adapter === "codex" && authSource === "api")
    return skipped("skipped_cap", "Codex API spend is unmetered; RESEARCH_MONTHLY_USD cannot be enforced");
  if (authSource === "api" && usage.monthlyUsd >= limits.monthlyUsd)
    return skipped("skipped_cap", "monthly research USD cap reached");
  if (usage.dailyCalls >= limits.dailyCalls) return skipped("skipped_cap", "daily research call cap reached");
  if (usage.dailyTokens >= limits.dailyTokens)
    return skipped("skipped_cap", "daily research token cap reached");
  if (limits.sharedDailyTokens && usage.sharedDailyTokens >= limits.sharedDailyTokens)
    return skipped("skipped_cap", "shared daily token ceiling reached");
  if (adapter === "codex") {
    if (!Number.isFinite(usage.codexDailyCalls) || usage.codexDailyCalls < 0) return skipped("skipped_cap", "Codex call count is unavailable");
    if (usage.codexDailyCalls >= codexDailyCalls(env)) return skipped("skipped_cap", "daily Codex call cap reached");
    return checkCodexQuota({ env, codexQuota });
  }
  if (authSource === "subscription") return checkLiveResearchQuota({ env, liveUsage, usage, runCalls });
  return { ok: true, status: "ok", reason: null };
}

/** The override applies only when the usage endpoint answered 403. Other failures (401, 429, 5xx, timeout, no token, malformed) stop the run.
 * `usage` and `runCalls` are read only for the gate's override decision. The in-flight monitor passes `monitor: true` and `override` (whether the gate was an override run). */
export async function checkLiveResearchQuota({ env = process.env, liveUsage = () => fetchLiveUsage(env.CLAUDE_CODE_OAUTH_TOKEN), usage, runCalls, monitor = false, override = false }) {
  const result = await liveUsage();
  if (!result?.usage || ![result.usage.fiveHour?.pct, result.usage.sevenDay?.pct].every((pct) => Number.isFinite(pct) && pct >= 0 && pct <= 100)) {
    const reason = `live Claude quota unavailable: ${result?.unavailable ?? "invalid response"}`;
    if (!overrideOn(env) || result?.unavailable !== "403") return skipped("skipped_quota", reason);
    if (monitor) return override ? { ok: true, status: "ok", reason: null, override: true } : skipped("skipped_quota", reason);
    const capped = checkOverrideCaps(env, usage, runCalls);
    if (capped) return capped;
    const { dailyCalls, monthlyCalls } = overrideLimits(env);
    return { ok: true, status: "ok", reason: `${reason}; running under RESEARCH_QUOTA_UNKNOWN_OVERRIDE caps`, override: true, overrideCaps: { dailyCalls, monthlyCalls } };
  }
  const fiveHour = number(env, "RESEARCH_QUOTA_STOP_5H_PCT", 70);
  const sevenDay = number(env, "RESEARCH_QUOTA_STOP_7D_PCT", 80);
  if (result.usage.fiveHour.pct >= fiveHour) return skipped("skipped_quota", `five-hour quota at ${result.usage.fiveHour.pct}%`);
  if (result.usage.sevenDay.pct >= sevenDay) return skipped("skipped_quota", `seven-day quota at ${result.usage.sevenDay.pct}%`);
  return { ok: true, status: "ok", reason: null };
}

/** `codexQuota` returns { pct } when `codex exec --json` has reported a rate limit, otherwise null. */
export async function checkCodexQuota({ env = process.env, codexQuota }) {
  const reading = await codexQuota?.();
  if (reading && Number.isFinite(reading.pct) && reading.pct >= 0 && reading.pct <= 100) {
    return reading.pct >= CODEX_QUOTA_STOP_PCT ? skipped("skipped_quota", `Codex rate limit at ${reading.pct}%`) : { ok: true, status: "ok", reason: null };
  }
  return env.RESEARCH_CODEX_QUOTA_UNKNOWN === "allow" ? { ok: true, status: "ok", reason: null } : skipped("skipped_quota", "Codex rate limit is not reported; set RESEARCH_CODEX_QUOTA_UNKNOWN=allow to run anyway");
}
