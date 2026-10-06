import type pg from "pg";

export const BUDGET_EXIT_CODE = 4;
export function caps(env: NodeJS.ProcessEnv = process.env) {
  const tokens = Number(env.AI_MONTHLY_TOKEN_CAP ?? 500000);
  const usd = Number(env.AI_MONTHLY_USD_CAP ?? 20);
  if (!Number.isSafeInteger(tokens) || tokens < 1 || !Number.isFinite(usd) || usd <= 0) throw new Error("Invalid AI monthly budget");
  return { tokens, usd };
}
export function withinBudget(spent: { tokens: number; usd: number }, reserve: { tokens: number; usd: number }, cap: { tokens: number; usd: number }) {
  return spent.tokens + reserve.tokens <= cap.tokens && spent.usd + reserve.usd <= cap.usd;
}
export const monthStart = (date = new Date()) => `${date.toISOString().slice(0, 7)}-01`;

export async function budgetTotal(db: Pick<pg.Pool, "query">, month = monthStart()) {
  const r = await db.query<{ tokens: string; usd: string }>(`SELECT COALESCE(sum(COALESCE(used_tokens,reserved_tokens)),0)::text AS tokens,
    COALESCE(sum(COALESCE(used_usd,reserved_usd)),0)::text AS usd FROM ai_budget_calls WHERE month=$1::date`, [month]);
  return { tokens: Number(r.rows[0].tokens), usd: Number(r.rows[0].usd) };
}
export async function reserveCall(pool: pg.Pool, call: { id: string; kind: "extract" | "judge"; tokens: number; usd: number }, cap = caps()) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ai-budget:${monthStart()}`]);
    const spent = await budgetTotal(client, monthStart());
    if (!withinBudget(spent, call, cap)) { await client.query("ROLLBACK"); return { allowed: false, spent, cap }; }
    await client.query("INSERT INTO ai_budget_calls (id,month,kind,reserved_tokens,reserved_usd) VALUES ($1,$2,$3,$4,$5)", [call.id, monthStart(), call.kind, call.tokens, call.usd]);
    await client.query("COMMIT");
    return { allowed: true, spent, cap };
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
export async function finishCall(db: Pick<pg.Pool, "query">, call: { id: string; tokens: number | null; usd: number | null }) {
  const r = await db.query(`UPDATE ai_budget_calls SET used_tokens=COALESCE($2,reserved_tokens),used_usd=COALESCE($3,reserved_usd),completed_at=now()
    WHERE id=$1 AND completed_at IS NULL`, [call.id, call.tokens, call.usd]);
  return (r.rowCount ?? 0) > 0;
}
