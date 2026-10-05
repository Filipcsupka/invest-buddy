import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { isIsoDate } from "../../../../db/iso-date";
import { buildJudgeInput, DEFAULT_MAX_SYMBOLS } from "../../../../db/judge-input";

export const runtime = "nodejs";
function authorized(header: string | null, token: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}
/** Read-only: scores, consensus facts, chart technicals, deterministic signals, portfolio baseline and earlier ideas for the judge. Lives under /api/ingest so the public ingress filter hides it. */
export async function GET(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const asOf = new URL(request.url).searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOf)) return Response.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const max = Number(new URL(request.url).searchParams.get("maxSymbols") ?? DEFAULT_MAX_SYMBOLS);
  if (!Number.isInteger(max) || max < 1 || max > 40) return Response.json({ error: "maxSymbols must be 1-40" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json(await buildJudgeInput(pool, asOf, new Date(), max)); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
