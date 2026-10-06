import { logIngestRequest, recordIngestError } from "../request-log";
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
/**
 * Read-only: scores, consensus facts, chart technicals, data-only signals (action, size tier, ratings), the private portfolio baseline and earlier ideas
 * for the judge. The baseline marks held names and fills the owner's EUR band; it never decides a buy action or a tier, and the script does not pass it
 * to the model. Lives under /api/ingest so the public ingress filter hides it.
 */
async function getHandler(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const asOf = new URL(request.url).searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOf)) return Response.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const max = Number(new URL(request.url).searchParams.get("maxSymbols") ?? DEFAULT_MAX_SYMBOLS);
  if (!Number.isInteger(max) || max < 1 || max > 40) return Response.json({ error: "maxSymbols must be 1-40" }, { status: 400 });
  const requested = new URL(request.url).searchParams.get("symbols")?.split(",").filter(Boolean) ?? [];
  if (requested.length > 40 || requested.some((symbol) => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))) return Response.json({ error: "Invalid symbols" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json(await buildJudgeInput(pool, asOf, new Date(), max, requested)); }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

export const GET = (request: Request) => logIngestRequest("/api/ingest/judge-input", request, () => getHandler(request));
