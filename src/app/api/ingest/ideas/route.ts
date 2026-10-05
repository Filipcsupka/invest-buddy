import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { hasOkJudge, hasOkJudgeForDay, ideasPostSchema, judgeRunSchema, recordJudge } from "../../../../db/ideas";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";
const limit = 400_000;
function authorized(header: string | null, token: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}
function gate(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  return null;
}

/** Skip check. `?asOf=2026-10-05&agent=claude&inputHash=<64 hex>` returns `{ skip: true }` when an applied ok run with that input exists. Without `inputHash` it answers for the whole day: one run per day. */
export async function GET(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const day = q.get("inputHash") === null;
  const parsed = judgeRunSchema.pick({ asOf: true, agent: true, inputHash: true }).safeParse({ asOf: q.get("asOf"), agent: q.get("agent"), inputHash: day ? "0".repeat(64) : q.get("inputHash") });
  if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ skip: day ? await hasOkJudgeForDay(pool, parsed.data) : await hasOkJudge(pool, parsed.data) }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

/** Stores one judge run and the ideas that changed. The model never calls this; run-judge.mjs does, after validating the output. */
export async function POST(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const text = await readBoundedBody(request, limit);
  if (text === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = ideasPostSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ recorded: true, ...(await recordJudge(pool, parsed.data)) }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
