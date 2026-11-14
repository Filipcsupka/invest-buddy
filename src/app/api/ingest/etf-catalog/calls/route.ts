import pg from "pg";
import { logEodhdCalls } from "../../../../../db/asset-bars";
import { ACCOUNT_DAILY_BUDGET } from "../../../../../jobs/eodhd-etf";
import { readBoundedBody } from "../../read-bounded-body";
import { logIngestRequest, recordIngestError } from "../../request-log";
import { authorized } from "../route";

export const runtime = "nodejs";
const path = "/api/ingest/etf-catalog/calls";

function check(request: Request): Response | null {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  return null;
}

async function get(request: Request) {
  const denied = check(request);
  if (denied) return denied;
  const accountBudget = Number(process.env.EODHD_ACCOUNT_DAILY_BUDGET ?? ACCOUNT_DAILY_BUDGET);
  if (!Number.isInteger(accountBudget) || accountBudget < 1 || accountBudget > 100_000)
    return Response.json({ error: "Invalid account budget" }, { status: 503 });
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await db.query<{ account_calls: string; enrich_calls: string }>(`SELECT
      COALESCE(sum(calls),0)::text AS account_calls,
      COALESCE(sum(calls) FILTER (WHERE job='etf-enrich'),0)::text AS enrich_calls
      FROM eodhd_call_log WHERE run_date=CURRENT_DATE`);
    return Response.json({ accountCallsToday: Number(result.rows[0].account_calls), enrichCallsToday: Number(result.rows[0].enrich_calls), accountBudget });
  } catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await db.end(); }
}

async function post(request: Request) {
  const denied = check(request);
  if (denied) return denied;
  const body = await readBoundedBody(request, 1_000);
  if (body === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const calls = (value as { totalCalls?: unknown } | null)?.totalCalls;
  if (!Number.isInteger(calls) || (calls as number) < 0 || (calls as number) > 1_000_000 || (calls as number) % 10 !== 0)
    return Response.json({ error: "Invalid call total" }, { status: 400 });
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await logEodhdCalls(db, "etf-enrich", calls as number, true);
    return Response.json({ reported: true });
  } catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await db.end(); }
}

export const GET = (request: Request) => logIngestRequest(path, request, () => get(request));
export const POST = (request: Request) => logIngestRequest(path, request, () => post(request));
