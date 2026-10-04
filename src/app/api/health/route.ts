import pg from "pg";
export const runtime = "nodejs";
export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ database: "unavailable", lastScanAsOf: null, lastScoreDate: null }, { status: 503 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    const result = await pool.query<{ scan: string | null; score: string | null }>("SELECT (SELECT max(as_of)::text FROM scan_runs) scan, (SELECT max(as_of)::text FROM score_results) score");
    return Response.json({ database: "ok", lastScanAsOf: result.rows[0].scan, lastScoreDate: result.rows[0].score });
  } catch { return Response.json({ database: "unavailable", lastScanAsOf: null, lastScoreDate: null }, { status: 503 }); }
  finally { await pool.end(); }
}
