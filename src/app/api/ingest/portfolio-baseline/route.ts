import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { baselineSchema, latestBaseline, saveBaseline } from "../../../../db/portfolio-baseline";

export const runtime = "nodejs";
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
export async function GET(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const asOf = new URL(request.url).searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)) || new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) return Response.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ baseline: await latestBaseline(pool, asOf) }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

/** Stores or replaces the baseline for its date. A person calls this today; an interactive IBKR MCP session can call it later. */
export async function POST(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const text = await request.text();
  if (text.length > 100_000) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = baselineSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { await saveBaseline(pool, parsed.data); return Response.json({ recorded: true }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
