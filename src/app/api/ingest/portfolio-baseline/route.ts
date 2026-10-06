import { logIngestRequest, recordIngestError } from "../request-log";
import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { isIsoDate } from "../../../../db/iso-date";
import { baselineSchema, latestBaseline, saveBaseline } from "../../../../db/portfolio-baseline";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";
const limit = 100_000;
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

/** Newest baseline on or before `?asOf=` (default today). Personal data, so it sits behind the ingest token like the rest of /api/ingest. */
async function getHandler(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const asOf = new URL(request.url).searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOf)) return Response.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ baseline: await latestBaseline(pool, asOf) }); }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

/** Stores or replaces the baseline for its date. A person calls this today; an interactive IBKR MCP session can call it later. */
async function postHandler(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const text = await readBoundedBody(request, limit);
  if (text === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = baselineSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { await saveBaseline(pool, parsed.data); return Response.json({ recorded: true }); }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

export const GET = (request: Request) => logIngestRequest("/api/ingest/portfolio-baseline", request, () => getHandler(request));

export const POST = (request: Request) => logIngestRequest("/api/ingest/portfolio-baseline", request, () => postHandler(request));
