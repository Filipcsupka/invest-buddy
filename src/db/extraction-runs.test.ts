import { describe, expect, it } from "vitest";
import { extractionRunSchema, hasOkExtraction, recordExtraction, reviewDueSymbols, usageFromClaudeEnvelope } from "./extraction-runs";

const hash = "a".repeat(64);
const run = { symbol: "NVDA", asOf: "2026-10-05", agent: "claude" as const, model: "haiku", inputHash: hash, status: "ok" as const };
const pool = (rowCount = 1) => { const calls: { sql: string; params: unknown[] }[] = []; return { calls, query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rowCount, rows: [] }; } } as never as { calls: typeof calls; query: never }; };

describe("extraction runs", () => {
  it("accepts a long accession history, as real tickers carry over 100", () => {
    const accessions = Array.from({ length: 200 }, (_, i) => `0001628280-26-${String(i).padStart(6, "0")}`);
    expect(extractionRunSchema.safeParse({ ...run, accessions }).success).toBe(true);
    expect(extractionRunSchema.safeParse({ ...run, accessions: [...accessions, ...accessions, ...accessions] }).success).toBe(false);
  });
  it("selects a bounded set of stale or never reviewed symbols", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = { query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [{ ticker: "NVDA" }] }; } };
    expect(await reviewDueSymbols(db as never, 30, 6)).toEqual(["NVDA"]);
    expect(calls[0].params).toEqual([30, 6]);
    expect(calls[0].sql).toContain("applied_at IS NOT NULL");
    expect(calls[0].sql).toContain("i.source <> 'benchmark'");
    expect(calls[0].sql).toContain("max(created_at) AS attempted_at");
    expect(calls[0].sql).toContain("ORDER BY a.attempted_at NULLS FIRST");
  });
  it("skips only when an ok, applied, unexpired run with the same key exists", async () => {
    const hit = pool(1), miss = pool(0);
    expect(await hasOkExtraction(hit, { symbol: "NVDA", agent: "claude", inputHash: hash })).toBe(true);
    expect(await hasOkExtraction(miss, { symbol: "NVDA", agent: "claude", inputHash: hash })).toBe(false);
    expect(hit.calls[0].sql).toContain("status='ok'");
    expect(hit.calls[0].sql).toContain("applied_at IS NOT NULL");
    expect(hit.calls[0].sql).toContain("expires_at > now()");
    expect(hit.calls[0].params).toEqual(["NVDA", "claude", hash]);
    expect(hit.calls[0].sql).not.toContain("as_of");
  });
  it("records usage and output, applied time only when applied, and never downgrades an ok row", async () => {
    const p = pool();
    await recordExtraction(p, { ...run, usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 40, turns: 1 }, output: { symbol: "NVDA" }, applied: true });
    const { sql, params } = p.calls[0];
    expect(sql).toContain("ON CONFLICT (symbol,as_of,agent,input_hash)");
    expect(sql).toContain("WHERE extraction_runs.status <> 'ok' OR EXCLUDED.status = 'ok'");
    expect(params).toEqual(["NVDA", "2026-10-05", "claude", "haiku", hash, "ok", 10, 20, 30, 40, 1, '{"symbol":"NVDA"}', null, true, null, []]);
    const q = pool();
    await recordExtraction(q, { ...run, status: "failed", error: "schema: bad" });
    expect(q.calls[0].params).toEqual(["NVDA", "2026-10-05", "claude", "haiku", hash, "failed", null, null, null, null, null, null, "schema: bad", false, null, []]);
  });
  it("validates the body", () => {
    expect(extractionRunSchema.safeParse(run).success).toBe(true);
    expect(extractionRunSchema.safeParse({ ...run, status: "done" }).success).toBe(false);
    expect(extractionRunSchema.safeParse({ ...run, inputHash: "abc" }).success).toBe(false);
    expect(extractionRunSchema.safeParse({ ...run, extra: 1 }).success).toBe(false);
  });
  it("maps the Claude JSON envelope", () => {
    expect(usageFromClaudeEnvelope({ num_turns: 1, usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: 7, cache_creation_input_tokens: 8 } })).toEqual({ inputTokens: 5, outputTokens: 6, cacheReadTokens: 7, cacheCreationTokens: 8, turns: 1 });
    expect(usageFromClaudeEnvelope(null)).toEqual({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null, turns: null });
  });
});
