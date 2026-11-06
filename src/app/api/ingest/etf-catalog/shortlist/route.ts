import pg from "pg";
import { shortlistedCatalog } from "../../../../../db/etf-catalog-ingest";
import { authorized } from "../route";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!process.env.INGEST_TOKEN) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), process.env.INGEST_TOKEN)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ items: await shortlistedCatalog(db) }); }
  finally { await db.end(); }
}
