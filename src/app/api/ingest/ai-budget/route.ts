import { logIngestRequest, recordIngestError } from "../request-log";
import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { budgetTotal, caps, finishCall, reserveCall } from "../../../../db/ai-budget";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";
function gate(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = createHash("sha256").update(supplied).digest(), b = createHash("sha256").update(token).digest();
  if (!supplied || !timingSafeEqual(a, b)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  return null;
}
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reserve"), id: z.uuid(), kind: z.enum(["extract", "judge"]), tokens: z.number().int().positive().max(100000), usd: z.number().positive().max(10) }).strict(),
  z.object({ action: z.literal("finish"), id: z.uuid(), tokens: z.number().int().nonnegative().nullable(), usd: z.number().nonnegative().nullable() }).strict(),
]);
async function getHandler(request: Request) {
  const denied = gate(request); if (denied) return denied;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json({ month: new Date().toISOString().slice(0, 7), spent: await budgetTotal(pool), cap: caps() }); }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Budget unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
async function postHandler(request: Request) {
  const denied = gate(request); if (denied) return denied;
  const text = await readBoundedBody(request, 2000);
  if (text === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown; try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (parsed.data.action === "reserve") {
      const result = await reserveCall(pool, parsed.data);
      return Response.json(result, { status: result.allowed ? 200 : 429 });
    }
    return Response.json({ finished: await finishCall(pool, parsed.data) });
  } catch (error) { recordIngestError(request, error); return Response.json({ error: "Budget unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}

export const GET = (request: Request) => logIngestRequest("/api/ingest/ai-budget", request, () => getHandler(request));

export const POST = (request: Request) => logIngestRequest("/api/ingest/ai-budget", request, () => postHandler(request));
