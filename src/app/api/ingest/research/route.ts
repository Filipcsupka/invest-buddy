import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import pg from "pg";
import { logIngestRequest, recordIngestError } from "../request-log";
import { readBoundedBody } from "../read-bounded-body";
import { validateResearchOutput, type ResearchOutput, RUN_TYPES, ADAPTERS } from "../../../../research/types";
import { isIsoDate } from "../../../../db/iso-date";
import { insertResearchOutput, insertSkippedRun } from "../../../../db/research";

export const runtime = "nodejs";
export function authorized(header: string | null, token: string): boolean {
  const supplied=header?.startsWith("Bearer ")?header.slice(7):"";
  return !!supplied && timingSafeEqual(createHash("sha256").update(supplied).digest(),createHash("sha256").update(token).digest());
}
export function skipErrors(value: unknown): string[] {
  if(!value || typeof value!=="object" || Array.isArray(value)) return ["$.skip: expected object"];
  const s=value as Record<string,unknown>; const errors:string[]=[];
  for(const k of Object.keys(s)) if(!["runId","runType","asOf","status","stopReason","adapter"].includes(k)) errors.push(`$.skip.${k}: unknown field`);
  if(s.runId!==undefined && (typeof s.runId!=="string" || !/^[0-9a-f-]{36}$/i.test(s.runId))) errors.push("$.skip.runId: invalid UUID");
  if(!RUN_TYPES.includes(s.runType as never)) errors.push("$.skip.runType: invalid run type");
  if(typeof s.asOf!=="string" || !isIsoDate(s.asOf)) errors.push("$.skip.asOf: invalid date");
  if(!["killed","skipped_cap","skipped_quota","skipped_window"].includes(String(s.status))) errors.push("$.skip.status: invalid skip status");
  if(typeof s.stopReason!=="string" || !s.stopReason.trim()) errors.push("$.skip.stopReason: required");
  if(!ADAPTERS.includes(s.adapter as never)) errors.push("$.skip.adapter: invalid adapter");
  return errors;
}
async function handler(request:Request) {
  const token=process.env.INGEST_TOKEN;
  if(!token) return Response.json({error:"Ingest unavailable"},{status:503});
  if(!authorized(request.headers.get("authorization"),token)) return Response.json({error:"Unauthorized"},{status:401});
  const body=await readBoundedBody(request,1_000_000);
  if(body===null) return Response.json({error:"Payload too large"},{status:413});
  let value:unknown; try {value=JSON.parse(body);} catch {return Response.json({error:"Invalid JSON"},{status:400});}
  const skip=value && typeof value==="object" && !Array.isArray(value) && "skip" in value ? (value as {skip:unknown}).skip : null;
  const errors=skip ? [
    ...Object.keys(value as Record<string,unknown>).filter(k=>k!=="skip").map(k=>`$.${k}: unknown field`),
    ...skipErrors(skip),
  ] : validateResearchOutput(value);
  if(errors.length) return Response.json({error:"Invalid research output",fields:errors.map(message=>({path:message.split(":")[0],reason:message}))},{status:400});
  if(!process.env.DATABASE_URL) return Response.json({error:"Database unavailable"},{status:503});
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try {
    if(skip) { const s=skip as {runId?:string;runType:string;asOf:string;status:string;stopReason:string;adapter:string};
      return Response.json(await insertSkippedRun(pool,{...s,runId:s.runId??randomUUID()})); }
    return Response.json(await insertResearchOutput(pool,value as ResearchOutput));
  } catch(error) {recordIngestError(request,error);return Response.json({error:"Database unavailable"},{status:503});}
  finally {await pool.end();}
}
export const POST=(request:Request)=>logIngestRequest("/api/ingest/research",request,()=>handler(request));
