import pg from "pg";
import { RESEARCH_CANDIDATE_LIMIT, etfResearchCandidates } from "../../../../../db/etf-catalog";
import { authorized } from "../route";
export const runtime = "nodejs";
/** Highest rated ETFs for the optional owner research run. Same token and shape as the shortlist route, plus the rating context. */
export async function GET(request: Request) {
  if (!process.env.INGEST_TOKEN) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), process.env.INGEST_TOKEN)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? 25 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > RESEARCH_CANDIDATE_LIMIT) return Response.json({ error: `limit must be 1 to ${RESEARCH_CANDIDATE_LIMIT}` }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ items: await etfResearchCandidates(limit, db) }); }
  finally { await db.end(); }
}
