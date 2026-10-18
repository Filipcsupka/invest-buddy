import pg from "pg";
import { buildRows } from "../../scripts/horizon-report";
import { appendComputed, storedProfile } from "../db/horizon-labels";

export async function writeHorizonLabels(pool: pg.Pool, asOf: string): Promise<{ total: number; inserted: number; counts: Record<string, number> }> {
  const rows = await buildRows(pool, asOf);
  const session = await pool.query<{ ticker: string; session_date: string }>(
    "SELECT ticker,max(bar_date)::text AS session_date FROM daily_bars WHERE bar_date<=$1::date GROUP BY ticker", [asOf]);
  const dates = new Map(session.rows.map((r) => [r.ticker,r.session_date]));
  const filings = await pool.query<{ ticker: string; filing_date: string }>(
    "SELECT ticker,max(filed)::text AS filing_date FROM fundamentals_pit WHERE filed<=$1::date AND form IN ('10-Q','10-K') GROUP BY ticker", [asOf]);
  const filed = new Map(filings.rows.map((r) => [r.ticker,r.filing_date]));
  const client = await pool.connect();
  let inserted = 0;
  const counts: Record<string, number> = { sustained: 0, event_driven: 0, mixed: 0, no_data: 0 };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(516377496)");
    for (const row of rows) {
      counts[storedProfile(row.result.profile)]++;
      if (await appendComputed(client, { ticker: row.ticker, asOf, sessionDate: dates.get(row.ticker) ?? asOf, filingDate: filed.get(row.ticker), result: row.result })) inserted++;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { total: rows.length, inserted, counts };
}

if (/(?:^|[/\\])horizon-labels\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !process.env.DATABASE_URL) throw new Error("Usage: horizon-labels [YYYY-MM-DD] (DATABASE_URL required)");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  writeHorizonLabels(pool, asOf).then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}
