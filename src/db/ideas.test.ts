import { describe, expect, it } from "vitest";
import { hasOkJudge, ideaSchema, ideaSignature, ideasPostSchema, listIdeas, recordJudge, mapIdea } from "./ideas";
import { sampleIdeas } from "../ideas/fixtures";

const hash = "c".repeat(64);
const base = { symbol: "NVDA", action: "ADD", amountMinEur: 60, amountMaxEur: 90, verdict: "v", whatHappened: ["a", "b"], whyItMatters: ["c"], setup: { company: "Strong", entry: "Good", catalyst: "Neutral" }, numbers: [{ label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" }], plan: { amountNow: "EUR 60-90", trigger: "t", invalidation: "i", opportunityCost: "o" }, evidence: [{ url: "https://sec.gov/x", label: "x" }], unconfirmed: false };
const stored = { ...base, signature: "ADD|Strong|Good|Neutral|60-90", ruleConfigVersion: "2026-10-05.1" };
const run = { asOf: "2026-10-05", agent: "claude" as const, model: "sonnet", inputHash: hash, status: "ok" as const, usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4, turns: 1 }, costUsd: 0.01 };

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
  });
  it("lets the script add carriedFrom but nothing else", () => {
    expect(ideasPostSchema.safeParse({ run, ideas: [{ ...stored, carriedFrom: "2026-09-20", conflictNote: "c", downgradedFrom: "ADD" }] }).success).toBe(true);
    expect(ideasPostSchema.safeParse({ run, ideas: [{ ...stored, other: 1 }] }).success).toBe(false);
    expect(ideasPostSchema.safeParse({ run: { ...run, status: "done" }, ideas: [] }).success).toBe(false);
  });
  it("signature is action, the three ratings and the band, not wording", () => {
    expect(ideaSignature(base as never)).toBe("ADD|Strong|Good|Neutral|60-90");
  });
  it("the sample ideas used by the page are valid", () => {
    for (const stored of sampleIdeas) {
      const rest: Record<string, unknown> = { ...stored };
      for (const key of ["id", "createdAt", "model", "carriedFrom", "asOf", "signature", "ruleConfigVersion", "conflictNote", "downgradedFrom"]) delete rest[key];
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
    expect(sqls).toEqual(["BEGIN", "INSERT", "INSERT", "COMMIT"]);
    const insert = p.calls[1];
    expect(insert.sql).toContain("ON CONFLICT (as_of,symbol,input_hash) DO NOTHING");
    expect(insert.params).toContain("ADD|Strong|Good|Neutral|60-90");
    expect(insert.params).toContain("2026-09-20");
    expect(p.calls[2].sql).toContain("WHERE judge_runs.status <> 'ok' OR EXCLUDED.status = 'ok'");
    expect(p.calls[2].params.slice(0, 11)).toEqual(["2026-10-05", "claude", "sonnet", hash, "ok", 1, 2, 3, 4, 1, 0.01]);
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
    const row = { id: "7", as_of: "2026-10-05", symbol: "NVDA", action: "ADD", amount_min_eur: "60.00", amount_max_eur: "90.00", verdict: "v", what_happened: ["a", "b"], why_it_matters: ["c"], setup: base.setup, numbers: base.numbers, plan: base.plan, evidence_urls: base.evidence, unconfirmed: false, carried_from: null, conflict_note: null, downgraded_from: null, signature: "s", rule_config_version: "v", model: "sonnet", created_at: "2026-10-05T18:00:00Z" };
    const calls: string[] = [];
    const list = await listIdeas({ query: async (sql: string) => { calls.push(sql); return { rows: [row] }; } } as never, 10);
    expect(calls[0]).toContain("expires_at > now()");
    expect(calls[0]).toContain("ORDER BY i.as_of DESC, i.id DESC");
    expect(calls[0]).toContain("d.meta->>'display_allowed' = 'true'");
    expect(list[0]).toMatchObject({ id: 7, amountMinEur: 60, amountMaxEur: 90, evidence: base.evidence });
    expect(mapIdea(row as never).createdAt).toBe("2026-10-05T18:00:00.000Z");
  });
});
