import { logIngestRequest, recordIngestError } from "../../request-log";
import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { isIsoDate } from "../../../../../db/iso-date";
import { buildBundle, MAX_WINDOW_DAYS } from "../../../../../db/bundle";

export const runtime = "nodejs";
function authorized(header: string | null, token: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}
/** Read-only: stored documents and facts for one tracked ticker, for the extractor. Lives under /api/ingest so the public ingress filter hides it. */
async function getHandler(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const symbol = (await context.params).symbol.toUpperCase();
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const query = new URL(request.url).searchParams;
  const days = Number(query.get("days") ?? MAX_WINDOW_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 365) return Response.json({ error: "days must be 1-365" }, { status: 400 });
  const asOf = query.get("asOf") ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(asOf)) return Response.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const known = await pool.query(`SELECT 1 FROM universe_membership WHERE ticker=$1 AND list <> 'benchmark'
      AND valid_from <= $2::date AND (valid_to IS NULL OR valid_to > $2::date) LIMIT 1`, [symbol, asOf]);
    if (!known.rows.length) return Response.json({ error: "Unknown symbol" }, { status: 404 });
    return Response.json(await buildBundle(pool, symbol, days, new Date(), undefined, asOf));
  }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

export const GET = (request: Request, context: { params: Promise<{ symbol: string }> }) => logIngestRequest("/api/ingest/bundle/[symbol]", request, () => getHandler(request, context));
