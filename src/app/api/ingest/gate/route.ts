import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { isIsoDate } from "../../../../db/iso-date";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";

function authorized(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return Boolean(supplied) && timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(token).digest());
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const stage = url.searchParams.get("stage");
  if (!isIsoDate(date) || !["extract", "judge"].includes(stage ?? "")) return Response.json({ error: "Invalid gate request" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{ symbols: string[]; reasons: Record<string, string[]>; accessions: Record<string, string[]>; extracted_at: Date | null; judged_at: Date | null; revision: number }>(
      "SELECT symbols,reasons,accessions,extracted_at,judged_at,revision FROM scheduled_gates WHERE gate_date=$1::date", [date]);
    if (!result.rows.length) return Response.json({ error: `No detect gate for ${date}` }, { status: 404 });
    const row = result.rows[0];
    if (stage === "judge" && !row.extracted_at) return Response.json({ error: "Extraction has not completed" }, { status: 409 });
    const consumed = stage === "extract" ? Boolean(row.extracted_at) : Boolean(row.judged_at);
    return Response.json({ asOf: date, symbols: consumed ? [] : row.symbols, reasons: consumed ? {} : row.reasons, accessions: consumed ? {} : row.accessions, consumed, revision: row.revision });
  } finally { await pool.end(); }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const raw = await readBoundedBody(request, 1024);
  if (raw === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : null; }
  catch { return Response.json({ error: "Invalid gate request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("date" in body) || !("stage" in body) || !("revision" in body) || typeof body.date !== "string" || !isIsoDate(body.date) || typeof body.stage !== "string" || !["extract", "judge"].includes(body.stage) || typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 1) return Response.json({ error: "Invalid gate request" }, { status: 400 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const column = body.stage === "extract" ? "extracted_at" : "judged_at";
    const result = await pool.query(`UPDATE scheduled_gates SET ${column}=COALESCE(${column},now()) WHERE gate_date=$1::date AND revision=$2${body.stage === "judge" ? " AND extracted_at IS NOT NULL" : ""} RETURNING gate_date`, [body.date, body.revision]);
    if (!result.rowCount) return Response.json({ error: "Gate unavailable" }, { status: 409 });
    return Response.json({ recorded: true });
  } finally { await pool.end(); }
}
