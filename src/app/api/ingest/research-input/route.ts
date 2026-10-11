import pg from "pg";
import { logIngestRequest, recordIngestError } from "../request-log";
import { authorized } from "../research/route";
import { researchInput } from "../../../../db/research";
export const runtime="nodejs";
async function handler(request:Request) {
  const token=process.env.INGEST_TOKEN;
  if(!token) return Response.json({error:"Ingest unavailable"},{status:503});
  if(!authorized(request.headers.get("authorization"),token)) return Response.json({error:"Unauthorized"},{status:401});
  const url=new URL(request.url), type=url.searchParams.get("type"),symbol=url.searchParams.get("symbol")?.toUpperCase();
  if(!["daily","weekly","deepdive"].includes(type??"")) return Response.json({error:"Invalid type"},{status:400});
  if(type==="deepdive" && (!symbol || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))) return Response.json({error:"Invalid symbol"},{status:400});
  if(!process.env.DATABASE_URL) return Response.json({error:"Database unavailable"},{status:503});
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try {return Response.json(await researchInput(pool,type as "daily"|"weekly"|"deepdive",symbol));}
  catch(error) {recordIngestError(request,error);return Response.json({error:"Database unavailable"},{status:503});}
  finally {await pool.end();}
}
export const GET=(request:Request)=>logIngestRequest("/api/ingest/research-input",request,()=>handler(request));
