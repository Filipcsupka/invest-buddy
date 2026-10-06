import type pg from "pg";
import { z } from "zod";
import { isoDate } from "./iso-date";

/** One AI extraction attempt for a ticker. Stored so an unchanged input is skipped and token use is visible per run. */
export const extractionRunSchema = z.object({
  symbol: z.string().regex(/^[A-Z.]{1,10}$/),
  asOf: isoDate(),
  agent: z.enum(["claude", "codex"]),
  model: z.string().min(1).max(100),
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  accessions: z.array(z.string().regex(/^\d{10}-\d{2}-\d{6}$/)).max(100).optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
  status: z.enum(["pending", "ok", "failed", "skipped"]),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cacheReadTokens: z.number().int().nonnegative().nullable(),
    cacheCreationTokens: z.number().int().nonnegative().nullable(),
    turns: z.number().int().nonnegative().nullable(),
  }).partial().optional(),
  output: z.unknown().optional(),
  error: z.string().max(2000).nullable().optional(),
  applied: z.boolean().optional(),
}).strict();
export type ExtractionRun = z.infer<typeof extractionRunSchema>;

/** True when this exact input was already extracted and its result applied for the same agent and symbol. The date is not part of the key, so an unchanged input is skipped on later days until the row expires. An ok row that was never applied (dry run, failed post) does not skip. */
export async function hasOkExtraction(pool: Pick<pg.Pool, "query">, key: { symbol: string; agent: string; inputHash: string }): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM extraction_runs WHERE symbol=$1 AND agent=$2 AND input_hash=$3 AND status='ok' AND applied_at IS NOT NULL AND expires_at > now() LIMIT 1", [key.symbol, key.agent, key.inputHash]);
  return (result.rowCount ?? 0) > 0;
}

/** Insert or update the row for (symbol, as_of, agent, input_hash). A later ok never gets downgraded by a replayed failure. */
export async function recordExtraction(pool: Pick<pg.Pool, "query">, run: ExtractionRun): Promise<void> {
  const u = run.usage ?? {};
  await pool.query(`INSERT INTO extraction_runs (symbol,as_of,agent,model,input_hash,status,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,turns,output,error,applied_at,cost_usd,accessions)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,CASE WHEN $14::boolean THEN now() END,$15,$16::text[])
    ON CONFLICT (symbol,as_of,agent,input_hash) DO UPDATE SET
      model=EXCLUDED.model, status=EXCLUDED.status, input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens,
      cache_read_tokens=EXCLUDED.cache_read_tokens, cache_creation_tokens=EXCLUDED.cache_creation_tokens, turns=EXCLUDED.turns,
      output=EXCLUDED.output, error=EXCLUDED.error, applied_at=EXCLUDED.applied_at,cost_usd=EXCLUDED.cost_usd,accessions=EXCLUDED.accessions,expires_at=now()+interval '30 days'
    WHERE extraction_runs.status <> 'ok' OR EXCLUDED.status = 'ok'`,
  [run.symbol, run.asOf, run.agent, run.model, run.inputHash, run.status, u.inputTokens ?? null, u.outputTokens ?? null, u.cacheReadTokens ?? null, u.cacheCreationTokens ?? null, u.turns ?? null,
    run.output === undefined ? null : JSON.stringify(run.output), run.error ?? null, run.applied ?? false, run.costUsd ?? null, run.accessions ?? []]);
}

/** Maps the JSON envelope printed by `claude -p --output-format json` to the usage columns. Missing numbers stay null. */
export function usageFromClaudeEnvelope(envelope: unknown): NonNullable<ExtractionRun["usage"]> {
  const e = (envelope && typeof envelope === "object" ? envelope : {}) as { usage?: Record<string, unknown>; num_turns?: unknown };
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  return { inputTokens: n(e.usage?.input_tokens), outputTokens: n(e.usage?.output_tokens), cacheReadTokens: n(e.usage?.cache_read_input_tokens), cacheCreationTokens: n(e.usage?.cache_creation_input_tokens), turns: n(e.num_turns) };
}
