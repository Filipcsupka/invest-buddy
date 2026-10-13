import type pg from "pg";

/** Totals include reserved calls, so a concurrent runner cannot bypass the call cap. */
export async function researchCapUsage(db: Pick<pg.Pool, "query">) {
  const result = await db.query<{
    day: string; month: string; monthly_tokens: string; monthly_usd: string;
    daily_calls: string; codex_daily_calls: string; daily_tokens: string; shared_daily_tokens: string;
  }>(`WITH clock AS (
      SELECT (now() AT TIME ZONE 'Europe/Bratislava')::date AS day
    ), calls AS (
      SELECT b.*, (b.created_at AT TIME ZONE 'Europe/Bratislava')::date AS local_day
      FROM ai_budget_calls b, clock
      WHERE b.created_at >= LEAST(
        (date_trunc('month', clock.day::timestamp) AT TIME ZONE 'Europe/Bratislava'),
        (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
    )
    SELECT clock.day::text AS day, to_char(clock.day, 'YYYY-MM') AS month,
      COALESCE(sum(COALESCE(calls.used_tokens, calls.reserved_tokens)) FILTER
        (WHERE calls.kind='research' AND calls.local_day >= date_trunc('month', clock.day::timestamp)::date), 0)::text AS monthly_tokens,
      COALESCE(sum(COALESCE(calls.used_usd, calls.reserved_usd)) FILTER
        (WHERE calls.kind='research' AND calls.local_day >= date_trunc('month', clock.day::timestamp)::date), 0)::text AS monthly_usd,
      count(*) FILTER (WHERE calls.kind='research' AND calls.local_day=clock.day)::text AS daily_calls,
      count(*) FILTER (WHERE calls.kind='research' AND calls.agent='codex' AND calls.local_day=clock.day)::text AS codex_daily_calls,
      COALESCE(sum(COALESCE(calls.used_tokens, calls.reserved_tokens)) FILTER
        (WHERE calls.kind='research' AND calls.local_day=clock.day), 0)::text AS daily_tokens,
      COALESCE(sum(COALESCE(calls.used_tokens, calls.reserved_tokens)) FILTER
        (WHERE calls.auth_source='subscription' AND
          (calls.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date), 0)::text AS shared_daily_tokens
    FROM clock LEFT JOIN calls ON true GROUP BY clock.day`, []);
  const row = result.rows[0];
  if (!row) throw new Error("research cap usage unavailable");
  return { day: row.day, month: row.month, monthlyTokens: Number(row.monthly_tokens), monthlyUsd: Number(row.monthly_usd), dailyCalls: Number(row.daily_calls), codexDailyCalls: Number(row.codex_daily_calls ?? 0), dailyTokens: Number(row.daily_tokens), sharedDailyTokens: Number(row.shared_daily_tokens) };
}
