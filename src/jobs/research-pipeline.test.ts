import {describe,it,expect} from "vitest";
import pg from "pg";
import {eligiblePromotionSymbols,proposePromotion,runResearchPipeline} from "./research-pipeline";
import {insertResearchOutput,writeVerification} from "../db/research";
import sample from "../research/fixtures/sample-output.json";
import {randomUUID} from "node:crypto";
import type {ResearchOutput} from "../research/types";
import {promoteCandidate} from "../../scripts/discovery-promote";

describe("research promotion queue",()=>{
  it("never passes a foreign exchange to promotion",()=>{
    expect(eligiblePromotionSymbols([{symbol:"SIE",exchange:"XETRA"},{symbol:"ABB",exchange:"NYSE"},{symbol:"3687",exchange:"Tokyo"}])).toEqual(["ABB"]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("research promotion database",()=>{
  it("seeds a candidate only after a fact is checked and writes its event",async()=>{
    const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    const payload=structuredClone(sample) as unknown as ResearchOutput;
    payload.run.runId=randomUUID();
    const symbol=payload.output.candidates[0].symbol;
    try {
      await insertResearchOutput(pool,payload);
      expect((await pool.query("SELECT 1 FROM research_candidates WHERE symbol=$1",[symbol])).rowCount).toBe(0);
      const found=await pool.query<{id:number}>("SELECT id FROM research_findings WHERE run_id=$1 AND symbol=$2 ORDER BY id LIMIT 1",[payload.run.runId,symbol]);
      await writeVerification(pool,found.rows[0].id,{status:"verified",evidence:[{...payload.output.findings[0].evidence[0],status:"verified"}],sourceClass:"primary",sourceId:"research_web",confirmed:true});
      const prior=process.env.TWELVE_DATA_API_KEY;delete process.env.TWELVE_DATA_API_KEY;
      try {await runResearchPipeline(pool,"2026-10-11");} finally {if(prior)process.env.TWELVE_DATA_API_KEY=prior;}
      const candidate=await pool.query("SELECT state,thesis FROM research_candidates WHERE symbol=$1",[symbol]);
      expect(candidate.rows[0].state).toBe("DISCOVERED");
      expect(candidate.rows[0].thesis).toBe("");
      const second=await pool.query<{id:number}>("SELECT id FROM research_findings WHERE run_id=$1 AND finding_key='f2'",[payload.run.runId]);
      await writeVerification(pool,second.rows[0].id,{status:"verified",evidence:[{...payload.output.findings[1].evidence[0],status:"verified"}],sourceClass:"primary",sourceId:"research_web",confirmed:true});
      await runResearchPipeline(pool,"2026-10-11");
      const updated=await pool.query("SELECT thesis FROM research_candidates WHERE symbol=$1",[symbol]);
      expect(updated.rows[0].thesis).toBe(payload.output.candidates[0].thesis);
      const events=await pool.query("SELECT kind FROM research_events WHERE run_id=$1 ORDER BY id",[payload.run.runId]);
      expect(events.rows.map(e=>e.kind)).toContain("discovered");
    } finally {
      await pool.query("DELETE FROM research_events WHERE run_id=$1 OR symbol=$2",[payload.run.runId,symbol]);
      await pool.query("DELETE FROM research_candidates WHERE symbol=$1",[symbol]);
      await pool.query("DELETE FROM research_findings WHERE run_id=$1",[payload.run.runId]);
      await pool.query("DELETE FROM research_runs WHERE id=$1",[payload.run.runId]);
      await pool.end();
    }
  });
  it("never turns a verified macro_release finding into a candidate",async()=>{
    const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    const payload=structuredClone(sample) as unknown as ResearchOutput;
    payload.run.runId=randomUUID();
    const evidence={url:"https://example.com/news/2026-10-09-cpi",sourceName:"Example Wire (fixture)",sourceClassHint:"press" as const,publishedAt:"2026-10-09",
      quote:"Consumer prices rose 0.4% in September after 0.2% in August, above the 0.3% increase economists had expected."};
    payload.output.findings.push({id:"f90",symbol:"MACRO",companyName:"CPI",exchange:null,kind:"macro_release",field:null,polarity:"neutral",
      claim:"September CPI rose 0.4% against a 0.3% consensus.",eventDate:"2026-10-09",themes:[],evidence:[evidence],
      figures:[{label:"consensus",value:"0.3%",evidenceIndex:0},{label:"actual",value:"0.4%",evidenceIndex:0}],confidence:"medium",lead:false});
    try {
      await insertResearchOutput(pool,payload);
      const found=await pool.query<{id:number}>("SELECT id FROM research_findings WHERE run_id=$1 AND finding_key='f90'",[payload.run.runId]);
      await writeVerification(pool,found.rows[0].id,{status:"verified",evidence:[{...evidence,status:"verified"}],sourceClass:"press",sourceId:"research_web",confirmed:true});
      const prior=process.env.TWELVE_DATA_API_KEY;delete process.env.TWELVE_DATA_API_KEY;
      try {await runResearchPipeline(pool,"2026-10-11");} finally {if(prior)process.env.TWELVE_DATA_API_KEY=prior;}
      expect((await pool.query("SELECT 1 FROM research_candidates WHERE symbol='MACRO'")).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM research_events WHERE symbol='MACRO' AND kind='discovered'")).rowCount).toBe(0);
    } finally {
      await pool.query("DELETE FROM research_events WHERE run_id=$1 OR symbol='MACRO'",[payload.run.runId]);
      await pool.query("DELETE FROM research_candidates WHERE symbol='MACRO'");
      await pool.query("DELETE FROM research_findings WHERE run_id=$1",[payload.run.runId]);
      await pool.query("DELETE FROM research_runs WHERE id=$1",[payload.run.runId]);
      await pool.end();
    }
  });
  it("writes a pending DS1 row accepted by the promotion dry run",async()=>{
    const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted=await proposePromotion(client,{symbol:"RSXT",companyName:"Research Test",themes:["robotics"]},
        [{id:1,kind:"contract",evidence:[{url:"https://example.com/contract",status:"verified"}]}],"2026-10-11",
        {score:3,ruleScore:15,ruleState:"Watch",signalDate:"2026-10-10",benchmarkClose:500,sector:"Technology"});
      expect(inserted).toBe(true);
      expect(await proposePromotion(client,{symbol:"RSXN",companyName:"Nested Status Test",themes:["robotics"]},
        [{id:3,kind:"earnings",evidence:[{url:"https://example.com/nested",verify:{status:"verified"}}]}],"2026-10-11",
        {score:1,ruleScore:0,ruleState:"Wait",signalDate:"2026-10-11",benchmarkClose:null,sector:"Discovery"})).toBe(true);
      expect(await proposePromotion(client,{symbol:"RSXV",companyName:"Unverified Test",themes:["robotics"]},
        [{id:2,kind:"contract",evidence:[{url:"https://example.com/unverified",status:"blocked"}]}],"2026-10-11",
        {score:3,ruleScore:15,ruleState:"Watch",signalDate:"2026-10-10",benchmarkClose:500,sector:"Technology"})).toBe(false);
      const row=await client.query("SELECT status,sources FROM discovery_candidates WHERE symbol='RSXT'");
      expect(row.rows[0].status).toBe("pending");
      expect(row.rows[0].sources).toEqual([{kind:"research",url:"https://example.com/contract",detail:"contract"}]);
      const dry=await promoteCandidate(client as never,"RSXT",{dryRun:true,today:"2026-10-11",get:async()=>""});
      expect(dry.dryRun).toBe(true);
      expect(dry.name).toBe("Research Test");
    } finally {await client.query("ROLLBACK");client.release();await pool.end();}
  });
});
