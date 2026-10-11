import {describe,it,expect} from "vitest";
import {researchInput} from "./research";
describe("research input",()=>{
  it("returns position symbols without quantities or EUR values",async()=>{
    const db={query:async(sql:string)=>{
      if(sql.includes("FROM portfolio_baseline"))return {rows:[{positions:[{symbol:"NVDA",quantity:12.5,valueEur:5432,costEur:4200}]}]};
      if(sql.includes("FROM research_candidates"))return {rows:[]};
      return {rows:[]};
    }};
    const input=await researchInput(db as never,"daily",undefined,"2026-10-11");
    expect(input.symbols).toEqual(["NVDA"]);
    expect(input.positions).toEqual(["NVDA"]);
    const text=JSON.stringify(input);
    expect(text).not.toMatch(/quantity|valueEur|costEur|5432|4200|12\.5/);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("research storage database",()=>{
  it("commits a run and its facts, preserves model cards, and records verification once",async()=>{
    const {randomUUID}=await import("node:crypto");
    const {default:pg}=await import("pg");
    const {default:sample}=await import("../research/fixtures/sample-output.json");
    const {insertResearchOutput,writeVerification}=await import("./research");
    const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    const runId=randomUUID();
    const output=structuredClone(sample) as unknown as import("../research/types").ResearchOutput;
    output.run.runId=runId;
    try {
      expect((await insertResearchOutput(pool,output)).replayed).toBe(false);
      expect((await insertResearchOutput(pool,output)).replayed).toBe(true);
      const run=await pool.query<{model_output:typeof output.output}>("SELECT model_output FROM research_runs WHERE id=$1",[runId]);
      expect(run.rows[0].model_output.candidates).toEqual(output.output.candidates);
      expect(run.rows[0].model_output.chains).toEqual(output.output.chains);
      const finding=await pool.query<{id:number}>("SELECT id FROM research_findings WHERE run_id=$1 ORDER BY id LIMIT 1",[runId]);
      const id=finding.rows[0].id;
      await writeVerification(pool,id,{status:"verified",evidence:[{...output.output.findings[0].evidence[0],status:"verified"}],sourceClass:"primary",sourceId:"research_web",confirmed:true});
      await writeVerification(pool,id,{status:"verified",evidence:[],sourceClass:"primary",sourceId:"research_web",confirmed:true});
      const events=await pool.query("SELECT kind FROM research_events WHERE run_id=$1 AND finding_ids @> ARRAY[$2]::bigint[]",[runId,id]);
      expect(events.rows).toEqual([{kind:"finding_verified"}]);
    } finally {
      await pool.query("DELETE FROM research_events WHERE run_id=$1",[runId]);
      await pool.query("DELETE FROM research_findings WHERE run_id=$1",[runId]);
      await pool.query("DELETE FROM research_runs WHERE id=$1",[runId]);
      await pool.end();
    }
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("research input database",()=>{
  it("builds the daily trigger query on the migrated schema",async()=>{
    const {default:pg}=await import("pg");
    const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    try {const input=await researchInput(pool,"daily",undefined,"2026-10-11");expect(input.symbols).toEqual([]);}
    finally {await pool.end();}
  });
});
