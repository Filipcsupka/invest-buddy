import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import universe from "../../../../../scanner/universe.json";
import { extractionRunSchema, hasOkExtraction, recordExtraction } from "../../../../db/extraction-runs";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";
const limit = 200_000;
function authorized(header: string | null, token: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}
const known = (symbol: string) => (universe.instruments as { symbol: string }[]).some((item) => item.symbol === symbol);
function gate(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  return null;
}

/** Skip check: `?symbol=NVDA&asOf=2026-10-05&agent=claude&inputHash=<64 hex>` returns `{ skip: true }` when an ok run with that input exists. */
export async function GET(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const parsed = extractionRunSchema.pick({ symbol: true, asOf: true, agent: true, inputHash: true }).safeParse({ symbol: q.get("symbol")?.toUpperCase(), asOf: q.get("asOf"), agent: q.get("agent"), inputHash: q.get("inputHash") });
  if (!parsed.success || !known(parsed.data.symbol)) return Response.json({ error: "Invalid query" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ skip: await hasOkExtraction(pool, parsed.data) }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

/** Records one attempt (ok, failed, skipped or pending) with token usage. Never stores prompts or bundles, only the model output. */
export async function POST(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const text = await readBoundedBody(request, limit);
  if (text === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = extractionRunSchema.safeParse(raw);
  if (!parsed.success || !known(parsed.data.symbol)) return Response.json({ error: "Invalid body" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { await recordExtraction(pool, parsed.data); return Response.json({ recorded: true }); }
  catch { return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
