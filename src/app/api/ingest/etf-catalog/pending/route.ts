import pg from "pg";
import { pendingCatalog } from "../../../../../db/etf-catalog-ingest";
import { authorized } from "../route";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!process.env.INGEST_TOKEN) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), process.env.INGEST_TOKEN)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("limit") ?? "200";
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) return Response.json({ error: "limit must be 1 to 10000" }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ items: await pendingCatalog(db, limit) }); }
  finally { await db.end(); }
}
