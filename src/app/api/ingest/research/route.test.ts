import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import sample from "../../../../research/fixtures/sample-output.json";
const database=vi.hoisted(()=>({seen:new Set<string>(),findings:0}));
vi.mock("pg",()=>({default:{Pool:class {
  async connect(){return {query:this.query.bind(this),release(){}};}
  async query(sql:string,params?:unknown[]){
    if(sql.includes("INSERT INTO research_runs")){const id=String(params?.[0]);if(database.seen.has(id))return {rowCount:0,rows:[]};database.seen.add(id);return {rowCount:1,rows:[{id}]};}
    if(sql.includes("INSERT INTO research_findings"))database.findings++;
    return {rowCount:0,rows:[]};
  }
  async end(){}
}}}));
import {POST} from "./route";
const env=process.env;
const post=(body:string,token="secret")=>POST(new Request("http://localhost/api/ingest/research",{method:"POST",headers:{authorization:`Bearer ${token}`},body}));
describe("research ingest",()=>{
  beforeEach(()=>{database.seen.clear();database.findings=0;process.env={...env,INGEST_TOKEN:"secret",DATABASE_URL:"postgres://unused"};});
  afterEach(()=>{process.env=env;vi.restoreAllMocks();});
  it("stores a valid run once and reports a replay",async()=>{
    const body=JSON.stringify(sample);
    const first=await post(body);expect(first.status).toBe(200);expect(await first.json()).toEqual({replayed:false,findings:sample.output.findings.length});
    const count=database.findings;
    const second=await post(body);expect(second.status).toBe(200);expect(await second.json()).toEqual({replayed:true,findings:0});
    expect(database.findings).toBe(count);
  });
  it("rejects missing token",async()=>{const r=await POST(new Request("http://localhost/api/ingest/research",{method:"POST",body:"{}"}));expect(r.status).toBe(401);});
  it("rejects oversized bodies",async()=>{expect((await post("x".repeat(1_000_001))).status).toBe(413);});
  it("reports schema paths",async()=>{const value=structuredClone(sample) as Record<string,unknown>;delete value.schemaVersion;const r=await post(JSON.stringify(value));expect(r.status).toBe(400);expect(JSON.stringify(await r.json())).toContain("$.schemaVersion");});
});
