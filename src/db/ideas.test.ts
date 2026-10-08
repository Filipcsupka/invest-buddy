import { describe, expect, it } from "vitest";
import { hasOkJudge, ideaSchema, ideaSignature, ideasPostSchema, listIdeas, recordJudge, mapIdea } from "./ideas";
import { sampleIdeas } from "../ideas/fixtures";

const hash = "c".repeat(64);
const base = { symbol: "NVDA", action: "ADD", sizeTier: "ADD_THIRD", amountMinEur: 60, amountMaxEur: 90, verdict: "v", whatHappened: ["a", "b"], whyItMatters: ["c"], setup: { company: "Strong", entry: "Good", catalyst: "Neutral" }, numbers: [{ label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" }], plan: { amountNow: "EUR 60-90", trigger: "t", invalidation: "i", opportunityCost: "o" }, evidence: [{ url: "https://sec.gov/x", label: "x" }], unconfirmed: false };
const stored = { ...base, signature: "ADD|Strong|Good|Neutral|ADD_THIRD", ruleConfigVersion: "2026-10-06.1" };
const run = { asOf: "2026-10-05", runId: "11111111-1111-4111-8111-111111111111", agent: "claude" as const, model: "sonnet", inputHash: hash, status: "ok" as const, usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4, turns: 1 }, costUsd: 0.01 };

function fakePool(rowCount = 1) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const client = { query: async (sql: string, params?: unknown[]) => { calls.push({ sql, params: params ?? [] }); return { rowCount, rows: [] }; }, release() {} };
  return { calls, query: client.query, connect: async () => client } as never as { calls: typeof calls; query: never; connect: never };
}

describe("idea schema", () => {
  it("accepts a good idea and rejects bad ones", () => {
    expect(ideaSchema.safeParse(base).success).toBe(true);
    expect(ideaSchema.safeParse({ ...base, action: "BUY" }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, amountMinEur: 100 }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, whatHappened: ["only one"] }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, setup: { ...base.setup, entry: "Great" } }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, evidence: [{ url: "http://x.test/a", label: "x" }] }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, sizeTier: "HUGE" }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, sizeTier: "STARTER" }).success, "ADD carries ADD_THIRD only").toBe(false);
    expect(ideaSchema.safeParse({ ...base, action: "WATCH", sizeTier: "STARTER", amountMinEur: 0, amountMaxEur: 0 }).success).toBe(false);
    expect(ideaSchema.safeParse({ ...base, action: "START_POSITION", sizeTier: "FULL" }).success).toBe(true);
  });
  it("lets the script add carriedFrom but nothing else", () => {
    expect(ideasPostSchema.safeParse({ run, ideas: [{ ...stored, carriedFrom: "2026-09-20", conflictNote: "c", downgradedFrom: "ADD" }] }).success).toBe(true);
    const sk = { verdict: "Výrok", whatHappened: ["Prvý fakt", "Druhý fakt"], whyItMatters: ["Dôvod"], numbers: base.numbers, plan: base.plan, evidence: base.evidence };
    expect(ideasPostSchema.safeParse({ run, ideas: [{ ...stored, translations: { sk } }] }).success).toBe(true);
    expect(ideasPostSchema.safeParse({ run, ideas: [{ ...stored, translations: { sk: { ...sk, whatHappened: [] } } }] }).success).toBe(false);
    expect(ideasPostSchema.safeParse({ run, ideas: [{ ...stored, other: 1 }] }).success).toBe(false);
    expect(ideasPostSchema.safeParse({ run: { ...run, status: "done" }, ideas: [] }).success).toBe(false);
  });
  it("signature is action, the three ratings and the tier, not the EUR band or wording", () => {
    expect(ideaSignature(base as never)).toBe("ADD|Strong|Good|Neutral|ADD_THIRD");
    expect(ideaSignature({ ...base, amountMaxEur: 999 } as never)).toBe(ideaSignature(base as never));
  });
  it("the sample ideas used by the page are valid", () => {
    for (const stored of sampleIdeas) {
      const rest: Record<string, unknown> = { ...stored };
      for (const key of ["id", "createdAt", "model", "carriedFrom", "asOf", "signature", "ruleConfigVersion", "conflictNote", "downgradedFrom"]) delete rest[key];
      expect(stored.signature.endsWith(`|${stored.sizeTier}`) || stored.downgradedFrom !== null, stored.symbol).toBe(true);
      expect(ideaSchema.safeParse(rest).success, stored.symbol).toBe(true);
    }
  });
});

describe("judge storage", () => {
  it("skips only for an ok, applied, unexpired run with the same key", async () => {
    const p = fakePool(1);
    expect(await hasOkJudge(p, { asOf: "2026-10-05", agent: "claude", inputHash: hash })).toBe(true);
    expect(await hasOkJudge(fakePool(0), { asOf: "2026-10-05", agent: "claude", inputHash: hash })).toBe(false);
    expect(p.calls[0].sql).toContain("status='ok'");
    expect(p.calls[0].sql).toContain("applied_at IS NOT NULL");
    expect(p.calls[0].sql).toContain("expires_at > now()");
  });
  it("stores ideas and the run in one transaction, with a signature, and never downgrades an ok run", async () => {
    const p = fakePool();
    const r = await recordJudge(p as never, { run, ideas: [{ ...stored, carriedFrom: "2026-09-20" }] } as never);
    expect(r.stored).toBe(1);
    const sqls = p.calls.map((c) => c.sql.trim().split(/\s+/)[0]);
    expect(sqls).toEqual(["BEGIN", "SELECT", "INSERT", "INSERT", "INSERT", "COMMIT"]);
    const insert = p.calls[2];
    expect(insert.sql).toContain("ON CONFLICT (as_of,symbol,input_hash) DO NOTHING");
    expect(insert.params).toContain("ADD|Strong|Good|Neutral|ADD_THIRD");
    expect(insert.sql).toContain("size_tier");
    expect(insert.params.at(-3)).toBe("ADD_THIRD");
    expect(insert.params.at(-2)).toBe(run.runId);
    expect(insert.params.at(-1)).toBeNull();
    expect(insert.params).toContain("2026-09-20");
    expect(p.calls[1].sql).toContain("pg_advisory_xact_lock");
    expect(p.calls[3].sql).toContain("INSERT INTO record_signals");
    expect(p.calls[3].params).toEqual(["NVDA", "2026-10-05", run.runId, "ADD_THIRD", "ADD", "2026-10-06.1"]);
    expect(p.calls[3].sql).not.toContain("SELECT max(id) FROM record_signals");
    expect(p.calls[4].sql).toContain("WHERE judge_runs.status <> 'ok' OR EXCLUDED.status = 'ok'");
    expect(p.calls[4].params.slice(0, 11)).toEqual(["2026-10-05", "claude", "sonnet", hash, "ok", 1, 2, 3, 4, 1, 0.01]);
  });
  it("a failed run stores no ideas", async () => {
    const p = fakePool();
    const r = await recordJudge(p as never, { run: { ...run, status: "failed", error: "schema" }, ideas: [stored] } as never);
    expect(r.stored).toBe(0);
    expect(p.calls.map((c) => c.sql.trim().split(/\s+/)[0])).toEqual(["BEGIN", "INSERT", "COMMIT"]);
  });
  it("rolls back when a write fails", async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql.trim().split(/\s+/)[0]); if (sql.includes("INSERT")) throw new Error("boom"); return { rowCount: 0, rows: [] }; }, release() {} };
    await expect(recordJudge({ connect: async () => client } as never, { run, ideas: [] })).rejects.toThrow("boom");
    expect(calls).toEqual(["BEGIN", "INSERT", "ROLLBACK"]);
  });
  it("lists unexpired ideas newest first", async () => {
    const row = { id: "7", as_of: "2026-10-05", symbol: "NVDA", action: "ADD", size_tier: "ADD_THIRD", amount_min_eur: "60.00", amount_max_eur: "90.00", verdict: "v", what_happened: ["a", "b"], why_it_matters: ["c"], setup: base.setup, numbers: base.numbers, plan: base.plan, evidence_urls: base.evidence, unconfirmed: false, carried_from: null, conflict_note: null, downgraded_from: null, signature: "s", rule_config_version: "v", model: "sonnet", created_at: "2026-10-05T18:00:00Z" };
    const calls: string[] = [];
    const list = await listIdeas({ query: async (sql: string) => { calls.push(sql); return { rows: [row] }; } } as never, 10);
    expect(calls[0]).toContain("expires_at > now()");
    expect(calls[0]).toContain("ORDER BY i.as_of DESC, i.id DESC");
    expect(calls[0]).toContain("d.meta->>'display_allowed' = 'true'");
    expect(calls[0]).toContain("https://data.sec.gov/api/xbrl/%");
    expect(calls[0]).toContain("size_tier");
    expect(list[0]).toMatchObject({ id: 7, sizeTier: "ADD_THIRD", amountMinEur: 60, amountMaxEur: 90, evidence: base.evidence });
    expect(mapIdea({ ...row, size_tier: null } as never).sizeTier).toBeNull();
    expect(mapIdea(row as never).createdAt).toBe("2026-10-05T18:00:00.000Z");
  });
});

describe("trade_ideas in Postgres (migration 011)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("stores and lists the size tier, rejects an unknown tier, and defaults the owner band to 0", async () => {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const symbol = "TIERTEST";
    const inputHash = "e".repeat(64);
    const clean = async () => { await pool.query("DELETE FROM trade_ideas WHERE symbol=$1", [symbol]); await pool.query("DELETE FROM judge_runs WHERE input_hash=$1", [inputHash]); };
    try {
      await clean();
      const idea = { ...stored, symbol, evidence: [], action: "START_POSITION", sizeTier: "STANDARD", amountMinEur: 0, amountMaxEur: 0, signature: "START_POSITION|Strong|Good|Neutral|STANDARD" };
      expect((await recordJudge(pool, ideasPostSchema.parse({ run: { ...run, inputHash }, ideas: [idea] }))).stored).toBe(1);
      const listed = (await listIdeas(pool, 500)).find((i) => i.symbol === symbol);
      expect(listed).toMatchObject({ action: "START_POSITION", sizeTier: "STANDARD", amountMinEur: 0, amountMaxEur: 0 });
      const insert = (tier: string | null, asOf: string) => pool.query(`INSERT INTO trade_ideas (as_of,symbol,action,verdict,what_happened,why_it_matters,setup,numbers,plan,evidence_urls,signature,rule_config_version,input_hash,agent,model,size_tier)
        VALUES ($3,$1,'WATCH','v','[]','[]','{}','[]','{}','[]','s','v',$2,'claude','m',$4) RETURNING amount_min_eur, amount_max_eur, size_tier`, [symbol, inputHash, asOf, tier]);
      await expect(insert("HUGE", "2026-10-04")).rejects.toThrow(/size_tier/);
      expect((await insert(null, "2026-10-03")).rows[0]).toEqual({ amount_min_eur: "0.00", amount_max_eur: "0.00", size_tier: null });
    } finally { await clean(); await pool.end(); }
  });
});
