import pg from "pg";
import { describe, expect, it } from "vitest";
import { freshnessDays } from "../data/evidence";
import { expiredDocuments, purgeExtractionRuns, windowCase } from "./retention";
import { purgeIdeas } from "./retention-ideas";

describe("retention", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("keeps expired documents cited by current consensus", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    const cited = "https://example.test/retention-cited";
    const uncited = "https://example.test/retention-uncited";
    try {
      await client.query("BEGIN");
      for (const url of [cited, uncited]) await client.query(`INSERT INTO source_documents
        (source,symbol,doc_type,url,published_at,content_hash,body,expires_at)
        VALUES ('fixture','NVDA','test',$1,now()-interval '40 days','hash','test',now()-interval '1 day')`, [url]);
      await client.query(`INSERT INTO consensus_findings
        (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
        VALUES ('NVDA','guidanceRaised',current_date,true,'agree','{}'::jsonb,$1::jsonb,true,'fixture')`, [JSON.stringify([{ url: cited }])]);
      const result = await client.query(`DELETE ${expiredDocuments} RETURNING url`);
      expect(result.rows.map((row) => row.url)).toContain(uncited);
      expect(result.rows.map((row) => row.url)).not.toContain(cited);
      const kept = await client.query("SELECT id FROM source_documents WHERE url=$1", [cited]);
      expect(kept.rowCount).toBe(1);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });

  it("builds the consensus window from freshnessDays", () => {
    for (const [field, days] of Object.entries(freshnessDays)) expect(windowCase).toContain(`WHEN '${field}' THEN ${days}`);
    expect(expiredDocuments).toContain(windowCase);
  });

  it("protects every fresh consensus row, live idea and extraction output", () => {
    expect(expiredDocuments).toContain("c.as_of + CASE");
    expect(expiredDocuments).not.toContain("max(c2.as_of)");
    expect(expiredDocuments).toContain("FROM trade_ideas i WHERE i.expires_at > now()");
    expect(expiredDocuments).toContain("FROM extraction_runs r WHERE r.expires_at > now()");
    expect(expiredDocuments).toContain("jsonb_path_exists");
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("keeps documents cited by an older fresh finding, idea and extraction run", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    const urls = ["older", "idea", "extract", "uncited"].map((suffix) => `https://example.test/retention-${suffix}-${Date.now()}`);
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('RTNTEST','Retention test','Test','guide') ON CONFLICT DO NOTHING");
      for (const url of urls) await client.query(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,expires_at)
        VALUES ('fixture','RTNTEST','test',$1,now()-interval '40 days','hash','text',now()-interval '1 day')`, [url]);
      for (const [offset, url] of [[1, urls[0]], [0, "https://example.test/newer"]] as [number,string][]) await client.query(`INSERT INTO consensus_findings
        (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
        VALUES ('RTNTEST','epsBeat',current_date-$1::int,true,'agree','{}'::jsonb,$2::jsonb,true,'fixture')`, [offset, JSON.stringify([{ url }])]);
      await client.query(`INSERT INTO trade_ideas (as_of,symbol,action,amount_min_eur,amount_max_eur,verdict,what_happened,why_it_matters,setup,numbers,plan,evidence_urls,signature,rule_config_version,input_hash,agent,model)
        VALUES (current_date,'RTNTEST','WATCH',0,0,'test','[]','[]','{}','[]','{}',$1::jsonb,'s','v',$2,'claude','m')`, [JSON.stringify([{ url: urls[1] }]), "b".repeat(64)]);
      await client.query(`INSERT INTO extraction_runs (symbol,as_of,agent,model,input_hash,status,output)
        VALUES ('RTNTEST',current_date,'claude','m',$1,'ok',$2::jsonb)`, ["c".repeat(64), JSON.stringify({ evidence: [{ url: urls[2] }] })]);
      const removed = await client.query(`DELETE ${expiredDocuments} RETURNING url`);
      expect(removed.rows.map((row) => row.url)).toContain(urls[3]);
      for (const url of urls.slice(0, 3)) expect(removed.rows.map((row) => row.url)).not.toContain(url);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("deletes a document cited only by a 40 day old productCatalyst but keeps one cited by a 40 day old guidanceRaised", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    const stamp = Date.now();
    const catalyst = `https://example.test/retention-catalyst-${stamp}`, guidance = `https://example.test/retention-guidance-${stamp}`;
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('RTNTEST','Retention test','Test','guide') ON CONFLICT DO NOTHING");
      for (const url of [catalyst, guidance]) await client.query(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,expires_at)
        VALUES ('fixture','RTNTEST','test',$1,now()-interval '40 days','hash','text',now()-interval '1 day')`, [url]);
      for (const [field, url] of [["productCatalyst", catalyst], ["guidanceRaised", guidance]]) await client.query(`INSERT INTO consensus_findings
        (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
        VALUES ('RTNTEST',$1,current_date-40,true,'agree','{}'::jsonb,$2::jsonb,true,'fixture')`, [field, JSON.stringify([{ url }])]);
      const removed = (await client.query(`DELETE ${expiredDocuments} RETURNING url`)).rows.map((row) => row.url);
      expect(removed).toContain(catalyst);
      expect(removed).not.toContain(guidance);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });

  it("purges expired extraction_runs only, and a dry run only counts", async () => {
    const calls: string[] = [];
    const fake = (count: number, rowCount: number) => ({ query: async (sql: string) => { calls.push(sql); return { rows: [{ count }], rowCount }; } });
    expect(await purgeExtractionRuns(fake(3, 0), true)).toBe(3);
    expect(await purgeExtractionRuns(fake(0, 2), false)).toBe(2);
    expect(calls[0]).toMatch(/^SELECT count\(\*\)::int AS count FROM extraction_runs WHERE expires_at < now\(\)$/);
    expect(calls[1]).toBe("DELETE FROM extraction_runs WHERE expires_at < now()");
  });

  it("includes idea and judge run counts in the retention work", async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); return { rows: [{ count: 2 }], rowCount: 1 }; } };
    expect(await purgeIdeas(client, true)).toEqual({ tradeIdeas: 2, judgeRuns: 2 });
    expect(await purgeIdeas(client, false)).toEqual({ tradeIdeas: 1, judgeRuns: 1 });
    expect(calls).toEqual([
      "SELECT count(*)::int AS count FROM trade_ideas WHERE expires_at < now()",
      "SELECT count(*)::int AS count FROM judge_runs WHERE expires_at < now()",
      "DELETE FROM trade_ideas WHERE expires_at < now()",
      "DELETE FROM judge_runs WHERE expires_at < now()",
    ]);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("deletes expired extraction_runs rows in the database", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('RTNTEST','Retention test','Test','guide') ON CONFLICT DO NOTHING");
      const hash = "a".repeat(64);
      for (const [agent, expiry] of [["claude", "-1 day"], ["codex", "+1 day"]]) await client.query(
        `INSERT INTO extraction_runs (symbol, as_of, agent, model, input_hash, status, expires_at) VALUES ('RTNTEST',current_date,$1,'m',$2,'ok', now() + $3::interval)`, [agent, hash, expiry]);
      expect(await purgeExtractionRuns(client, true)).toBeGreaterThanOrEqual(1);
      expect(await purgeExtractionRuns(client, false)).toBeGreaterThanOrEqual(1);
      const left = await client.query("SELECT agent FROM extraction_runs WHERE symbol='RTNTEST'");
      expect(left.rows.map((row) => row.agent)).toEqual(["codex"]);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
