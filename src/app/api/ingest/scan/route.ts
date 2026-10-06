import { logIngestRequest, recordIngestError } from "../request-log";
import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { scanSchema } from "../../../../data/scan";
import { ingestScan } from "../../../../db/scan";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";
const limit = 1_000_000;
const buckets = new Map<string, { count: number; until: number }>();
function authorized(header: string | null, token: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}
async function postHandler(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = createHash("sha256").update(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").digest("hex");
  const now = Date.now();
  const bucket = buckets.get(key);
  if (bucket && bucket.until > now && bucket.count >= 60) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  buckets.set(key, { count: bucket && bucket.until > now ? bucket.count + 1 : 1, until: bucket && bucket.until > now ? bucket.until : now + 60_000 });
  const text = await readBoundedBody(request, limit);
  if (text === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = scanSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid scan", fields: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), reason: issue.message })) }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json(await ingestScan(pool, parsed.data, { skipMacro: new URL(request.url).searchParams.get("macro") === "skip" })); }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

export const POST = (request: Request) => logIngestRequest("/api/ingest/scan", request, () => postHandler(request));
