import { getPool } from "@/db/pool";
import type pg from "pg";
export const runtime = "nodejs";
export async function GET() {
  const pool = getPool();
  if (!pool) return Response.json({ database: "unavailable" }, { status: 503 });
  try {
    await pool.query({ text: "SELECT 1", query_timeout: 1000 } as pg.QueryConfig & { query_timeout: number });
    return Response.json({ database: "ok" });
  } catch { return Response.json({ database: "unavailable" }, { status: 503 }); }
}
