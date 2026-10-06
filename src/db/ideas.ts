import type pg from "pg";
import { z } from "zod";
import { isoDate } from "./iso-date";
import { SIZE_TIERS, tierFits, type SizeTier } from "../engine/signals";

export const ACTIONS = ["WATCH", "START_POSITION", "ADD", "HIGH_CONVICTION_ADD", "HOLD", "REDUCE", "THESIS_BROKEN", "CSPX_ALLOCATION"] as const;
export type IdeaAction = (typeof ACTIONS)[number];
export const RATINGS = ["Very strong", "Strong", "Good", "Neutral", "Weak"] as const;
export type Rating = (typeof RATINGS)[number];
export { SIZE_TIERS, type SizeTier };

const text = (max: number) => z.string().trim().min(1).max(max);
/** One idea as the judge writes it and as the ideas route accepts it. Mirrors scanner/schema/judge-output.schema.json. */
const ideaObject = z.object({
  symbol: z.string().regex(/^[A-Z0-9.]{1,10}$/),
  action: z.enum(ACTIONS),
  /** Public size: a share of a full position, never a currency amount. */
  sizeTier: z.enum(SIZE_TIERS),
  /** Owner view only: EUR band from the private baseline, 0 without one. */
  amountMinEur: z.number().nonnegative().max(1e7),
  amountMaxEur: z.number().nonnegative().max(1e7),
  verdict: text(240),
  whatHappened: z.array(text(300)).min(2).max(3),
  whyItMatters: z.array(text(300)).min(1).max(2),
  setup: z.object({ company: z.enum(RATINGS), entry: z.enum(RATINGS), catalyst: z.enum(RATINGS) }).strict(),
  numbers: z.array(z.object({ label: text(60), value: text(80) }).strict()).min(3).max(5),
  plan: z.object({ amountNow: text(200), trigger: text(300), invalidation: text(300), opportunityCost: text(300) }).strict(),
  evidence: z.array(z.object({ url: z.string().url().max(500).startsWith("https://"), label: text(120) }).strict()).max(4),
  unconfirmed: z.boolean(),
}).strict();
const amountsOrdered = (i: { amountMinEur: number; amountMaxEur: number }) => i.amountMaxEur >= i.amountMinEur;
const tierMatches = (i: { action: IdeaAction; sizeTier: SizeTier }) => tierFits(i.action, i.sizeTier);
const tierMessage = { message: "sizeTier does not fit the action" };
export const ideaSchema = ideaObject.refine(amountsOrdered, { message: "amountMaxEur must be at least amountMinEur" }).refine(tierMatches, tierMessage);
export type Idea = z.infer<typeof ideaSchema>;

/**
 * The key that decides whether an idea is news: the deterministic action, the three ratings and the size tier. The judge's wording and
 * the owner's EUR band are not part of it, so a change in the private baseline alone never makes an idea new.
 */
export const ideaSignature = (i: { action: string; setup: Idea["setup"]; sizeTier: SizeTier }) => `${i.action}|${i.setup.company}|${i.setup.entry}|${i.setup.catalyst}|${i.sizeTier}`;

const count = z.number().int().nonnegative().nullable().optional();
export const judgeRunSchema = z.object({
  asOf: isoDate(),
  agent: z.enum(["claude", "codex"]),
  model: z.string().min(1).max(100),
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["pending", "ok", "failed", "skipped"]),
  usage: z.object({ inputTokens: count, outputTokens: count, cacheReadTokens: count, cacheCreationTokens: count, turns: count }).optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
  ruleConfigVersion: z.string().min(1).max(40).optional(),
  ideaCount: z.number().int().nonnegative().optional(),
  error: z.string().max(2000).nullable().optional(),
  output: z.unknown().optional(),
}).strict();
export type JudgeRun = z.infer<typeof judgeRunSchema>;

/** Body of POST /api/ingest/ideas: one run record and the ideas that changed. `carriedFrom` is computed by the script from the input, never by the model. */
export const ideasPostSchema = z.object({
  run: judgeRunSchema,
  ideas: z.array(ideaObject.extend({
    carriedFrom: isoDate().nullable().optional(),
    /** Signature of the deterministic signal, not of the final action: a downgraded idea must not look new again tomorrow. */
    signature: z.string().min(1).max(160),
    ruleConfigVersion: z.string().min(1).max(40),
    conflictNote: z.string().min(1).max(300).nullable().optional(),
    downgradedFrom: z.enum(ACTIONS).nullable().optional(),
  }).refine(amountsOrdered, { message: "amountMaxEur must be at least amountMinEur" }).refine(tierMatches, tierMessage)).max(40),
});
export type IdeasPost = z.infer<typeof ideasPostSchema>;

/** A stored idea. sizeTier is null for ideas stored before migration 011. */
export interface StoredIdea extends Omit<Idea, "sizeTier"> { sizeTier: SizeTier | null; id: number; asOf: string; carriedFrom: string | null; conflictNote: string | null; downgradedFrom: IdeaAction | null; signature: string; ruleConfigVersion: string; model: string; createdAt: string }

/** True when this exact input already produced a stored result for the same agent and date. A run that never stored its ideas does not skip. */
export async function hasOkJudge(pool: Pick<pg.Pool, "query">, key: { asOf: string; agent: string; inputHash: string }): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM judge_runs WHERE as_of=$1 AND agent=$2 AND input_hash=$3 AND status='ok' AND applied_at IS NOT NULL AND expires_at > now() LIMIT 1", [key.asOf, key.agent, key.inputHash]);
  return (r.rowCount ?? 0) > 0;
}

/** One run per day: true when any applied ok run exists for the date and agent, whatever its input. */
export async function hasOkJudgeForDay(pool: Pick<pg.Pool, "query">, key: { asOf: string; agent: string }): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM judge_runs WHERE as_of=$1 AND agent=$2 AND status='ok' AND applied_at IS NOT NULL AND expires_at > now() LIMIT 1", [key.asOf, key.agent]);
  return (r.rowCount ?? 0) > 0;
}

type Client = Pick<pg.PoolClient, "query">;
/** Records the run and inserts the ideas in one transaction, so an ok run always has its ideas. Replaying the same input stores nothing twice. */
export async function recordJudge(pool: pg.Pool, body: IdeasPost): Promise<{ stored: number }> {
  const { run, ideas } = body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let stored = 0;
    if (run.status === "ok") {
      for (const i of ideas) stored += await insertIdea(client, i, run);
    }
    const u = run.usage ?? {};
    await client.query(`INSERT INTO judge_runs (as_of,agent,model,input_hash,status,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,turns,cost_usd,idea_count,stored_count,output,error,rule_config_version,applied_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,CASE WHEN $5='ok' THEN now() END)
      ON CONFLICT (as_of,agent,input_hash) DO UPDATE SET model=EXCLUDED.model,status=EXCLUDED.status,input_tokens=EXCLUDED.input_tokens,output_tokens=EXCLUDED.output_tokens,
        cache_read_tokens=EXCLUDED.cache_read_tokens,cache_creation_tokens=EXCLUDED.cache_creation_tokens,turns=EXCLUDED.turns,cost_usd=EXCLUDED.cost_usd,idea_count=EXCLUDED.idea_count,
        stored_count=EXCLUDED.stored_count,output=EXCLUDED.output,error=EXCLUDED.error,rule_config_version=EXCLUDED.rule_config_version,applied_at=EXCLUDED.applied_at,expires_at=now()+interval '30 days'
      WHERE judge_runs.status <> 'ok' OR EXCLUDED.status = 'ok'`,
    [run.asOf, run.agent, run.model, run.inputHash, run.status, u.inputTokens ?? null, u.outputTokens ?? null, u.cacheReadTokens ?? null, u.cacheCreationTokens ?? null, u.turns ?? null, run.costUsd ?? null,
      run.ideaCount ?? ideas.length, stored, run.output === undefined ? null : JSON.stringify(run.output), run.error ?? null, run.ruleConfigVersion ?? null]);
    await client.query("COMMIT");
    return { stored };
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}

async function insertIdea(client: Client, i: IdeasPost["ideas"][number], run: JudgeRun): Promise<number> {
  const r = await client.query(`INSERT INTO trade_ideas (as_of,symbol,action,amount_min_eur,amount_max_eur,verdict,what_happened,why_it_matters,setup,numbers,plan,evidence_urls,unconfirmed,carried_from,signature,input_hash,agent,model,rule_config_version,conflict_note,downgraded_from,size_tier)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    ON CONFLICT (as_of,symbol,input_hash) DO NOTHING`,
  [run.asOf, i.symbol, i.action, i.amountMinEur, i.amountMaxEur, i.verdict, JSON.stringify(i.whatHappened), JSON.stringify(i.whyItMatters), JSON.stringify(i.setup), JSON.stringify(i.numbers), JSON.stringify(i.plan), JSON.stringify(i.evidence),
    i.unconfirmed, i.carriedFrom ?? null, i.signature, run.inputHash, run.agent, run.model, i.ruleConfigVersion, i.conflictNote ?? null, i.downgradedFrom ?? null, i.sizeTier]);
  return r.rowCount ?? 0;
}

interface IdeaRow { id: string; as_of: string; symbol: string; action: IdeaAction; size_tier: SizeTier | null; amount_min_eur: string; amount_max_eur: string; verdict: string; what_happened: string[]; why_it_matters: string[]; setup: Idea["setup"]; numbers: Idea["numbers"]; plan: Idea["plan"]; evidence_urls: Idea["evidence"]; unconfirmed: boolean; carried_from: string | null; conflict_note: string | null; downgraded_from: IdeaAction | null; signature: string; rule_config_version: string; model: string; created_at: Date | string }
export const mapIdea = (r: IdeaRow): StoredIdea => ({ id: Number(r.id), asOf: r.as_of, symbol: r.symbol, action: r.action, sizeTier: r.size_tier ?? null, amountMinEur: Number(r.amount_min_eur), amountMaxEur: Number(r.amount_max_eur), verdict: r.verdict, whatHappened: r.what_happened, whyItMatters: r.why_it_matters, setup: r.setup, numbers: r.numbers, plan: r.plan, evidence: r.evidence_urls, unconfirmed: r.unconfirmed, carriedFrom: r.carried_from, conflictNote: r.conflict_note, downgradedFrom: r.downgraded_from, signature: r.signature, ruleConfigVersion: r.rule_config_version, model: r.model, createdAt: new Date(r.created_at).toISOString() });
const COLUMNS = "id,as_of::text,symbol,action,size_tier,amount_min_eur,amount_max_eur,verdict,what_happened,why_it_matters,setup,numbers,plan,evidence_urls,unconfirmed,carried_from::text,conflict_note,downgraded_from,signature,rule_config_version,model,created_at";

/** Unexpired ideas, newest first. */
export async function listIdeas(pool: Pick<pg.Pool, "query">, limit = 50): Promise<StoredIdea[]> {
  const r = await pool.query<IdeaRow>(`SELECT ${COLUMNS} FROM trade_ideas i WHERE i.expires_at > now()
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(i.evidence_urls) ref
      WHERE ref->>'url' NOT LIKE 'https://data.sec.gov/api/xbrl/%'
        AND NOT EXISTS (SELECT 1 FROM source_documents d WHERE d.url = ref->>'url' AND d.meta->>'display_allowed' = 'true'))
    ORDER BY i.as_of DESC, i.id DESC LIMIT $1`, [limit]);
  return r.rows.map(mapIdea);
}

/** The latest stored idea for each symbol, so the judge can tell what changed. */
export async function latestIdeaPerSymbol(pool: Pick<pg.Pool, "query">): Promise<StoredIdea[]> {
  const r = await pool.query<IdeaRow>(`SELECT DISTINCT ON (symbol) ${COLUMNS} FROM trade_ideas WHERE expires_at > now() ORDER BY symbol, as_of DESC, id DESC`);
  return r.rows.map(mapIdea);
}
