import pg from "pg";
import { describe, expect, it } from "vitest";

/** One dedicated client, so BEGIN and ROLLBACK wrap everything. pool.query would drop the connection after a failed statement and end the transaction. Needs a migrated TEST_DATABASE_URL. */
async function inRollback(fn: (pool: pg.Client) => Promise<void>) {
  const pool = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await pool.connect();
  try { await pool.query("BEGIN"); await fn(pool); } finally { try { await pool.query("ROLLBACK"); } finally { await pool.end(); } }
}

// Same statement as the reconcile job's legacy upsert.
const upsert = `INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
  VALUES ($1,$2,$3,$4,$5,$6::jsonb,'[]'::jsonb,$7,$8)
  ON CONFLICT (symbol,field,as_of) DO UPDATE SET value=EXCLUDED.value,agreement=EXCLUDED.agreement,agent_values=EXCLUDED.agent_values,evidence_refs=EXCLUDED.evidence_refs,verified=EXCLUDED.verified,reason=EXCLUDED.reason,reconciled_at=now()`;

const count = async (pool: pg.Client, sql: string, params: unknown[] = []) => Number((await pool.query<{ n: string }>(sql, params)).rows[0].n);

describe("consensus_findings_history (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("keeps the old row when a same-day rerun changes the agent values", () => inRollback(async (pool) => {
    await pool.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('CHTEST','History test','Test','guide') ON CONFLICT DO NOTHING");
    const liveBefore = await count(pool, "SELECT count(*) AS n FROM consensus_findings");
    await pool.query(upsert, ["CHTEST", "epsBeat", "2026-10-05", true, "agree", JSON.stringify({ a: true, b: true }), true, "first run"]);
    expect(await count(pool, "SELECT count(*) AS n FROM consensus_findings_history WHERE symbol='CHTEST'")).toBe(0);
    await pool.query(upsert, ["CHTEST", "epsBeat", "2026-10-05", null, "disputed", JSON.stringify({ a: true, b: false }), false, "second run"]);

    const history = await pool.query("SELECT value, agreement, agent_values, verified, reason, superseded_at FROM consensus_findings_history WHERE symbol='CHTEST'");
    expect(history.rowCount).toBe(1);
    expect(history.rows[0]).toMatchObject({ value: true, agreement: "agree", agent_values: { a: true, b: true }, verified: true, reason: "first run" });
    expect(history.rows[0].superseded_at).toBeInstanceOf(Date);
    const live = await pool.query("SELECT agreement, reason FROM consensus_findings WHERE symbol='CHTEST'");
    expect(live.rows).toEqual([{ agreement: "disputed", reason: "second run" }]);
    expect(await count(pool, "SELECT count(*) AS n FROM consensus_findings")).toBe(liveBefore + 1);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("keeps a deleted row, lets the delete through, and rejects edits to history", () => inRollback(async (pool) => {
    await pool.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('CHTEST','History test','Test','guide') ON CONFLICT DO NOTHING");
    await pool.query(upsert, ["CHTEST", "epsBeat", "2026-10-05", true, "agree", "{}", true, "kept"]);
    await pool.query("DELETE FROM consensus_findings WHERE symbol='CHTEST'");
    expect(await count(pool, "SELECT count(*) AS n FROM consensus_findings WHERE symbol='CHTEST'")).toBe(0);
    expect(await count(pool, "SELECT count(*) AS n FROM consensus_findings_history WHERE symbol='CHTEST' AND reason='kept'")).toBe(1);
    await pool.query("SAVEPOINT s1");
    await expect(pool.query("UPDATE consensus_findings_history SET reason='x' WHERE symbol='CHTEST'")).rejects.toThrow(/immutable/);
    await pool.query("ROLLBACK TO SAVEPOINT s1");
    await expect(pool.query("DELETE FROM consensus_findings_history WHERE symbol='CHTEST'")).rejects.toThrow(/immutable/);
    await pool.query("ROLLBACK TO SAVEPOINT s1");
    await expect(pool.query("TRUNCATE consensus_findings_history")).rejects.toThrow(/immutable/);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("logs trigger overhead for 300 symbols by 12 fields", () => inRollback(async (pool) => {
    const symbols = Array.from({ length: 300 }, (_, i) => `CHP${String(i).padStart(3, "0")}`);
    const fields = Array.from({ length: 12 }, (_, i) => `field${i}`);
    await pool.query("INSERT INTO instruments (ticker,name,sector,source) SELECT s,'Perf test','Test','guide' FROM unnest($1::text[]) s ON CONFLICT DO NOTHING", [symbols]);
    const insert = `INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
      SELECT s,f,DATE '2026-10-05',true,'agree','{}'::jsonb,'[]'::jsonb,true,$3 FROM unnest($1::text[]) s CROSS JOIN unnest($2::text[]) f`;
    await pool.query(insert, [symbols, fields, "first"]);
    const update = "UPDATE consensus_findings SET reason='second' WHERE symbol = ANY($1) AND reason='first'";
    const start = performance.now();
    await pool.query(update, [symbols]);
    const withTrigger = performance.now() - start;
    await pool.query("ALTER TABLE consensus_findings DISABLE TRIGGER consensus_findings_keep");
    await pool.query("UPDATE consensus_findings SET reason='first' WHERE symbol = ANY($1)", [symbols]);
    const base = performance.now();
    await pool.query(update, [symbols]);
    const without = performance.now() - base;
    console.log(`consensus history trigger: 3600 rows updated in ${withTrigger.toFixed(0)} ms with trigger, ${without.toFixed(0)} ms without`);
    expect(await count(pool, "SELECT count(*) AS n FROM consensus_findings_history WHERE symbol = ANY($1)", [symbols])).toBe(3600);
  }));
});
