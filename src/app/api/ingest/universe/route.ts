import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { loadUniverse } from "../../../../db/universe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!supplied || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(token).digest()))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ instruments: await loadUniverse(pool) }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
