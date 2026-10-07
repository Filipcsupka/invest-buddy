import type pg from "pg";

type Call = { created_at: Date; completed_at: Date | null; kind: string; agent: string | null; model: string | null; status: string; cutoff_window: string | null; reset_at: Date | null; reset_hint: string | null; input_tokens: number | null; output_tokens: number | null; cache_read_tokens: number | null; cache_creation_tokens: number | null; used_tokens: number | null };
type Sample = { run_id: string; job: string; phase: string; observed_at: Date; five_hour_pct: string; seven_day_pct: string; five_hour_reset_at: Date | null; seven_day_reset_at: Date | null };

export async function recordUsageSample(db: Pick<pg.Pool, "query">, sample: { job: "extract" | "judge"; runId: string; phase: "start" | "check" | "end"; fiveHourPct: number; sevenDayPct: number; fiveHourResetAt: string | null; sevenDayResetAt: string | null }) {
  await db.query(`INSERT INTO ai_quota_samples (job,run_id,phase,five_hour_pct,seven_day_pct,five_hour_reset_at,seven_day_reset_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [sample.job, sample.runId, sample.phase, sample.fiveHourPct, sample.sevenDayPct, sample.fiveHourResetAt, sample.sevenDayResetAt]);
}

export function summarizeSamples(rows: Sample[]) {
  const runs = new Map<string, { job: string; runId: string; start: Sample | null; end: Sample | null; samples: number }>();
  let fiveHourPeakPct = 0, sevenDayPeakPct = 0;
  for (const row of rows) {
    fiveHourPeakPct = Math.max(fiveHourPeakPct, Number(row.five_hour_pct));
    sevenDayPeakPct = Math.max(sevenDayPeakPct, Number(row.seven_day_pct));
    const run = runs.get(row.run_id) ?? { job: row.job, runId: row.run_id, start: null, end: null, samples: 0 };
    run.samples++;
    if (row.phase === "start") run.start = row;
    if (row.phase === "end") run.end = row;
    runs.set(row.run_id, run);
  }
  return { fiveHourPeakPct, sevenDayPeakPct, runs: [...runs.values()].map((run) => ({ job: run.job, runId: run.runId, samples: run.samples, startedAt: run.start?.observed_at.toISOString() ?? null, endedAt: run.end?.observed_at.toISOString() ?? null, fiveHourStartPct: run.start ? Number(run.start.five_hour_pct) : null, fiveHourEndPct: run.end ? Number(run.end.five_hour_pct) : null, fiveHourStartResetAt: run.start?.five_hour_reset_at?.toISOString() ?? null, fiveHourEndResetAt: run.end?.five_hour_reset_at?.toISOString() ?? null, fiveHourAccountDeltaPct: run.start && run.end ? Number(run.end.five_hour_pct) - Number(run.start.five_hour_pct) : null, sevenDayStartPct: run.start ? Number(run.start.seven_day_pct) : null, sevenDayEndPct: run.end ? Number(run.end.seven_day_pct) : null, sevenDayStartResetAt: run.start?.seven_day_reset_at?.toISOString() ?? null, sevenDayEndResetAt: run.end?.seven_day_reset_at?.toISOString() ?? null, sevenDayAccountDeltaPct: run.start && run.end ? Number(run.end.seven_day_pct) - Number(run.start.seven_day_pct) : null })) };
}

function weekKey(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  return `${year}-W${String(Math.ceil((((d.getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}

export function summarizeUsage(rows: Call[]) {
  const days: Record<string, number> = {}, weeks: Record<string, number> = {}, callsByJobAndModel: Record<string, number> = {};
  const cutoffs: { at: string; window: string | null; resetAt: string | null; resetHint: string | null; job: string; model: string | null }[] = [];
  const window: { at: number; tokens: number }[] = [];
  let rollingTokens = 0, peakTokens = 0, peakAt: string | null = null, start = 0;
  for (const row of [...rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime())) {
    const at = row.created_at.getTime();
    while (start < window.length && window[start].at <= at - 5 * 3600000) rollingTokens -= window[start++].tokens;
    const components = [row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_creation_tokens];
    const tokens = components.some((n) => n !== null) ? components.reduce<number>((sum, n) => sum + (n ?? 0), 0) : row.agent === null && row.status === "ok" ? row.used_tokens ?? 0 : 0;
    window.push({ at, tokens }); rollingTokens += tokens;
    if (rollingTokens > peakTokens) { peakTokens = rollingTokens; peakAt = row.created_at.toISOString(); }
    const day = row.created_at.toISOString().slice(0, 10), week = weekKey(row.created_at);
    days[day] = (days[day] ?? 0) + tokens; weeks[week] = (weeks[week] ?? 0) + tokens;
    const key = `${row.kind}/${row.model ?? "unknown"}`;
    callsByJobAndModel[key] = (callsByJobAndModel[key] ?? 0) + 1;
    if (row.status === "cutoff") cutoffs.push({ at: (row.completed_at ?? row.created_at).toISOString(), window: row.cutoff_window, resetAt: row.reset_at?.toISOString() ?? null, resetHint: row.reset_hint, job: row.kind, model: row.model });
  }
  return { rolling5hPeak: { tokens: peakTokens, endedAt: peakAt }, tokensPerDayUtc: days, tokensPerIsoWeekUtc: weeks, cutoffCount: cutoffs.length, cutoffs, callsByJobAndModel };
}

export async function usageReport(db: Pick<pg.Pool, "query">) {
  const result = await db.query<Call>(`SELECT created_at,completed_at,kind,agent,model,status,cutoff_window,reset_at,reset_hint,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,used_tokens
    FROM ai_budget_calls WHERE (auth_source='subscription' OR (auth_source IS NULL AND agent IS NULL AND kind='judge')) AND created_at >= now() - interval '90 days' ORDER BY created_at`);
  const samples = await db.query<Sample>(`SELECT run_id::text,job,phase,observed_at,five_hour_pct::text,seven_day_pct::text,five_hour_reset_at,seven_day_reset_at FROM ai_quota_samples WHERE observed_at >= now() - interval '90 days' ORDER BY observed_at`);
  return { period: "last 90 days", ...summarizeUsage(result.rows), liveUsage: summarizeSamples(samples.rows) };
}
