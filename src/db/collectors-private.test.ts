import type pg from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { loadEpsSurprise, loadInsider } from "./collectors";

afterEach(() => vi.unstubAllEnvs());

it("uses EODHD EPS only when private mode is on and the fact was already observed", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return { rows: params[3] ? [{ as_of: "2026-09-01", value: { source: "eodhd", reportedDate: "2026-09-01", surprisePercent: 5 }, url: "https://eodhd.com/api/v1.1/fundamentals/AAPL.US#2026-09-01" }] : [] };
  } } as unknown as pg.Pool;
  vi.stubEnv("EODHD_PRIVATE_USE", "off");
  expect(await loadEpsSurprise(pool, "AAPL", "2026-10-05")).toBeNull();
  vi.stubEnv("EODHD_PRIVATE_USE", "on");
  expect(await loadEpsSurprise(pool, "AAPL", "2026-10-05")).toMatchObject({ value: true, refs: [{ publishedAt: "2026-09-01" }] });
  expect(calls[1].sql).toContain("f.computed_at::date <= $3::date");
});

it("uses an observed EODHD insider fact without a public filing link only in private mode", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("FROM collected_facts")) return { rows: params[4] ? [{ as_of: "2026-10-01", source_id: "eodhd", value: { netShares: 1000, netDollars: 200000 }, document_ids: [] }] : [] };
    return { rows: [] };
  } } as unknown as pg.Pool;
  vi.stubEnv("EODHD_PRIVATE_USE", "off");
  expect(await loadInsider(pool, "AAPL", "2026-10-05")).toBeNull();
  vi.stubEnv("EODHD_PRIVATE_USE", "on");
  expect(await loadInsider(pool, "AAPL", "2026-10-05")).toMatchObject({ value: true, refs: [], reason: expect.stringContaining("EODHD Form 4") });
  expect(calls[1].sql).toContain("computed_at::date <= $2::date");
});
