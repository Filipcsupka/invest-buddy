const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

function window(value) {
  if (!value || typeof value !== "object" || typeof value.utilization !== "number" || !Number.isFinite(value.utilization) || value.utilization < 0 || value.utilization > 100) throw new Error("malformed");
  const reset = value.resets_at ?? value.reset_at ?? null;
  const resetAt = reset && !Number.isNaN(new Date(reset).getTime()) ? new Date(reset).toISOString() : null;
  return { pct: value.utilization, resetAt };
}

export function parseLiveUsage(body) {
  if (!body || typeof body !== "object") throw new Error("malformed");
  return { fiveHour: window(body.five_hour), sevenDay: window(body.seven_day) };
}

export async function fetchLiveUsage(oauthToken, { fetcher = fetch, timeoutMs = 3000 } = {}) {
  if (!oauthToken) return { unavailable: "no token" };
  try {
    const response = await fetcher(USAGE_URL, { headers: { Authorization: `Bearer ${oauthToken}`, "anthropic-beta": "oauth-2025-04-20", Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { unavailable: String(response.status) };
    return { usage: parseLiveUsage(await response.json()) };
  } catch { return { unavailable: "request failed" }; }
}

const threshold = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
};

export function createUsageMonitor({ baseUrl, ingestToken, oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN, job, runId, log, fetcher = fetch, now = () => Date.now(), env = process.env, intervalMs = 180000 }) {
  const stopAtFive = threshold(env.AI_STOP_AT_FIVE_HOUR_PCT, 85);
  const stopAtSeven = threshold(env.AI_STOP_AT_SEVEN_DAY_PCT, 90);
  let lastCheck = -Infinity, unavailableLogged = false, disabled = false, inFlight = null;
  let stopped = null;
  const sample = (phase, force = false) => {
    if (inFlight) return inFlight;
    if (disabled || (!force && now() - lastCheck < intervalMs)) return Promise.resolve(stopped);
    lastCheck = now();
    inFlight = (async () => {
      const result = await fetchLiveUsage(oauthToken, { fetcher });
      if (result.unavailable) {
        if (!unavailableLogged) { log(`USAGE unavailable (${result.unavailable})`); unavailableLogged = true; }
        if (result.unavailable === "401" || result.unavailable === "403" || result.unavailable === "no token") disabled = true;
        return stopped;
      }
      const { fiveHour, sevenDay } = result.usage;
      log(`USAGE five_hour=${fiveHour.pct}% (resets ${fiveHour.resetAt ?? "unknown"}) seven_day=${sevenDay.pct}% (resets ${sevenDay.resetAt ?? "unknown"}) at ${phase}`);
      if (ingestToken) {
        try {
          const response = await fetcher(`${baseUrl}/api/ingest/ai-budget`, { method: "POST", headers: { Authorization: `Bearer ${ingestToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "sample", job, runId, phase, fiveHourPct: fiveHour.pct, sevenDayPct: sevenDay.pct, fiveHourResetAt: fiveHour.resetAt, sevenDayResetAt: sevenDay.resetAt }), signal: AbortSignal.timeout(3000) });
          if (!response.ok) log(`USAGE ledger unavailable (${response.status})`);
        } catch { log("USAGE ledger unavailable (request failed)"); }
      }
      if (!stopped && fiveHour.pct >= stopAtFive) stopped = { window: "5h", pct: fiveHour.pct, resetAt: fiveHour.resetAt };
      if (!stopped && sevenDay.pct >= stopAtSeven) stopped = { window: "weekly", pct: sevenDay.pct, resetAt: sevenDay.resetAt };
      return stopped;
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
  return { start: () => sample("start", true), check: () => sample("check"), end: () => sample("end", true), stopped: () => stopped };
}

export const earlyStopLine = (stop) => `STOPPING EARLY: ${stop.window === "5h" ? "five_hour" : "seven_day"} at ${stop.pct}%`;
