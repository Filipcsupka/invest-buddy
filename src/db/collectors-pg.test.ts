import pg from "pg";
import { describe, expect, it } from "vitest";
import { loadEpsSurprise, PostgresCollectorRepository } from "./collectors";
import { EPS_FACT_KEY } from "../data/eps";

/** One connection, so BEGIN and ROLLBACK wrap everything the repository writes. Needs a migrated TEST_DATABASE_URL. */
async function inRollback(fn: (pool: pg.Pool) => Promise<void>) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try { await pool.query("BEGIN"); await fn(pool); } finally { await pool.query("ROLLBACK"); await pool.end(); }
}

describe("collector tables (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("stores fact expiry, metered request counts and reads the EPS fact back", () => inRollback(async (pool) => {
    const repo = new PostgresCollectorRepository(pool);
    const url = "https://www.alphavantage.co/query?function=EARNINGS&symbol=NVDA#2026-08-27";
    const doc = await repo.upsertDocument({ source: "alphavantage", symbol: "NVDA", docType: "EPS surprise", url, publishedAt: "2026-08-27T00:00:00Z", body: "x", meta: { display_allowed: false }, contentHash: "h" });
    const value = { reportedDate: "2026-08-27", fiscalDateEnding: "2026-07-31", reportedEps: 1.05, estimatedEps: 1, surprisePercent: 5, source: "alphavantage", displayAllowed: false };
    expect(await repo.upsertFact({ symbol: "NVDA", key: EPS_FACT_KEY, asOf: "2026-08-27", value, documentIds: [doc.id], expiresAt: "2026-12-05" })).toBe(true);
    expect(await repo.upsertFact({ symbol: "AMD", key: "price_move_5d", asOf: "2026-10-05", value: { percent: 1 }, documentIds: [] })).toBe(true);
    const expiry = await pool.query<{ symbol: string; days: number }>("SELECT symbol, (expires_at::date - current_date) AS days FROM collected_facts WHERE symbol IN ('NVDA','AMD') AND fact_key IN ($1,'price_move_5d') ORDER BY symbol", [EPS_FACT_KEY]);
    expect(expiry.rows.find((row) => row.symbol === "AMD")?.days).toBe(30);
    expect((await pool.query("SELECT expires_at::date::text AS d FROM collected_facts WHERE symbol='NVDA' AND fact_key=$1", [EPS_FACT_KEY])).rows[0].d).toBe("2026-12-05");
    expect((await repo.latestFactDates(EPS_FACT_KEY)).get("NVDA")).toBe("2026-08-27");

    await repo.recordRun({ startedAt: "2026-10-05T08:00:00Z", sources: ["alphavantage"], requested: 1, succeeded: 1, failures: [], documentsWritten: 1, factsWritten: 1, stoppedReason: null, apiRequests: { alphavantage: 7 } });
    await repo.recordRun({ startedAt: "2026-10-04T08:00:00Z", sources: ["alphavantage"], requested: 1, succeeded: 1, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null, apiRequests: { alphavantage: 20 } });
    await repo.recordRun({ startedAt: "2026-10-05T09:00:00Z", sources: ["edgar"], requested: 1, succeeded: 1, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null });
    expect(await repo.apiRequestsSince("alphavantage", "2026-10-05T00:00:00.000Z")).toBe(7);
    expect(await repo.apiRequestsSince("alphavantage", "2099-01-01T00:00:00.000Z")).toBe(0);

    expect(await loadEpsSurprise(pool, "NVDA", "2026-10-05")).toMatchObject({ value: true, refs: [{ url, publishedAt: "2026-08-27" }] });
    expect(await loadEpsSurprise(pool, "NVDA", "2026-12-10")).toMatchObject({ value: null });
    expect(await loadEpsSurprise(pool, "NVDA", "2026-08-26")).toBeNull();
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("accepts verified_single and data_rule agreements and still rejects unknown ones", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    const insert = (agreement: string, field: string) => client.query(`INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
      VALUES ('NVDA',$2,'2026-10-05',true,$1,'{}'::jsonb,'[]'::jsonb,true,'test')`, [agreement, field]);
    try {
      await client.query("BEGIN");
      await insert("verified_single", "guidanceRaised");
      await insert("data_rule", "epsBeat");
      await client.query("SAVEPOINT s");
      await expect(insert("guess", "productCatalyst")).rejects.toThrow(/consensus_findings_agreement_check/);
      await client.query("ROLLBACK TO SAVEPOINT s");
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("stamps documents and facts with source, licence class and display flag, and keeps no null source_id", () => inRollback(async (pool) => {
    const repo = new PostgresCollectorRepository(pool);
    const base = { symbol: "NVDA", publishedAt: "2026-10-01T00:00:00Z", body: "x", contentHash: "h" };
    const edgar = await repo.upsertDocument({ ...base, source: "edgar", docType: "4", url: "https://www.sec.gov/p1", meta: { display_allowed: true } });
    await repo.upsertDocument({ ...base, source: "alphavantage", docType: "EPS surprise", url: "https://www.alphavantage.co/p2", meta: { display_allowed: false } });
    await repo.upsertDocument({ ...base, source: "gdelt", docType: "news headline", url: "https://example.com/p3", meta: {} });
    await repo.upsertDocument({ ...base, source: "sec-13f", sourceId: "sec", docType: "13F holdings summary", url: "https://www.sec.gov/p4", meta: { display_allowed: true } });
    const docs = await pool.query<{ source: string; source_id: string; licence_class: string; display_allowed: boolean }>("SELECT source, source_id, licence_class, display_allowed FROM source_documents WHERE url LIKE 'https://www.sec.gov/p%' OR url = 'https://www.alphavantage.co/p2' OR url = 'https://example.com/p3' ORDER BY url");
    expect(Object.fromEntries(docs.rows.map((row) => [row.source, [row.source_id, row.licence_class, row.display_allowed]]))).toEqual({
      edgar: ["sec", "public_gov", true], "sec-13f": ["sec", "public_gov", true], alphavantage: ["alphavantage", "internal_only", false], gdelt: ["gdelt", "public_attrib", false],
    });

    await repo.upsertFact({ symbol: "NVDA", key: EPS_FACT_KEY, asOf: "2026-10-01", value: { a: 1 }, documentIds: [] });
    await repo.upsertFact({ symbol: "NVDA", key: "some_new_key", asOf: "2026-10-01", value: { a: 1 }, documentIds: [edgar.id] });
    await repo.upsertFact({ symbol: "NVDA", key: "orphan_key", asOf: "2026-10-01", value: { a: 1 }, documentIds: [] });
    const facts = await pool.query<{ fact_key: string; source_id: string; licence_class: string }>("SELECT fact_key, source_id, licence_class FROM collected_facts WHERE symbol='NVDA' AND as_of='2026-10-01' ORDER BY fact_key");
    expect(Object.fromEntries(facts.rows.map((row) => [row.fact_key, [row.source_id, row.licence_class]]))).toEqual({
      [EPS_FACT_KEY]: ["alphavantage", "internal_only"], some_new_key: ["sec", "public_gov"], orphan_key: ["unknown", "unknown"],
    });

    for (const table of ["source_documents", "collected_facts", "daily_bars"]) expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE source_id IS NULL`)).rows[0].n, table).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM source_documents WHERE display_allowed IS DISTINCT FROM (COALESCE(meta->>'display_allowed','false') = 'true')")).rows[0].n).toBe(0);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("fills provenance for rows written without it and keeps display_allowed equal to meta", () => inRollback(async (pool) => {
    // What a job running the previous release writes during the rollout.
    await pool.query(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,meta) VALUES
      ('edgar','NVDA','4','https://www.sec.gov/old1','2026-10-01','h','x','{"display_allowed":true}'),
      ('vix',NULL,'VIX','https://www.cboe.com/old2','2026-10-01','h','x','{"display_allowed":false}')`);
    const rows = await pool.query<{ source_id: string; licence_class: string; display_allowed: boolean }>("SELECT source_id, licence_class, display_allowed FROM source_documents WHERE url IN ('https://www.sec.gov/old1','https://www.cboe.com/old2') ORDER BY url");
    expect(rows.rows).toEqual([{ source_id: "cboe", licence_class: "internal_only", display_allowed: false }, { source_id: "sec", licence_class: "public_gov", display_allowed: true }]);
    await pool.query("INSERT INTO collected_facts (symbol,fact_key,as_of,value) VALUES ('NVDA','old_fact','2026-10-01','{}')");
    expect((await pool.query("SELECT source_id, licence_class FROM collected_facts WHERE fact_key='old_fact'")).rows[0]).toEqual({ source_id: "unknown", licence_class: "unknown" });
  }));
});
