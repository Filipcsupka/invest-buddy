import type pg from "pg";

export const unknownUsageTokens = (env = process.env) => {
  const value = Number(env.AI_UNKNOWN_USAGE_TOKENS ?? "20000");
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("AI_UNKNOWN_USAGE_TOKENS must be a positive integer");
  return value;
};

export const monthStart = (date = new Date()) => `${date.toISOString().slice(0, 7)}-01`;

/** Completed subscription calls since UTC midnight. Missing usage is never counted as zero capacity. */
export async function dailyTokenUsage(db: Pick<pg.Pool, "query">): Promise<number> {
  const result = await db.query<{ tokens: string }>(`SELECT COALESCE(sum(used_tokens),0)::text AS tokens FROM ai_budget_calls
    WHERE auth_source='subscription' AND completed_at IS NOT NULL AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
  return Number(result.rows[0]?.tokens ?? 0);
}

export async function reserveCall(db: Pick<pg.Pool, "query">, call: { id: string; kind: "extract" | "judge"; agent: "claude" | "codex"; authSource: "subscription" | "api" | "codex"; model: string }) {
  await db.query("INSERT INTO ai_budget_calls (id,month,kind,agent,auth_source,model,reserved_tokens,reserved_usd) VALUES ($1,$2,$3,$4,$5,$6,0,0)", [call.id, monthStart(), call.kind, call.agent, call.authSource, call.model]);
  return { recorded: true };
}
export async function finishCall(db: Pick<pg.Pool, "query">, call: { id: string; tokens: number | null; usd: number | null; status?: "ok" | "failed" | "cutoff"; window?: string | null; resetAt?: string | null; resetHint?: string | null; inputTokens?: number | null; outputTokens?: number | null; cacheReadTokens?: number | null; cacheCreationTokens?: number | null }) {
  const r = await db.query(`UPDATE ai_budget_calls SET used_tokens=COALESCE($2,reserved_tokens),used_usd=COALESCE($3,reserved_usd),completed_at=now(),
    status=$4,cutoff_window=$5,reset_at=$6,reset_hint=$7,input_tokens=$8,output_tokens=$9,cache_read_tokens=$10,cache_creation_tokens=$11
    WHERE id=$1 AND completed_at IS NULL`, [call.id, call.tokens ?? unknownUsageTokens(), call.usd, call.status ?? "ok", call.window ?? null, call.resetAt ?? null, call.resetHint ?? null, call.inputTokens ?? null, call.outputTokens ?? null, call.cacheReadTokens ?? null, call.cacheCreationTokens ?? null]);
  return (r.rowCount ?? 0) > 0;
}
