import type pg from "pg";
import type { ScanPayload } from "../data/scan";
import { macroEvidenceFlags, tickerEvidenceFlags } from "../data/scan";

export interface IngestResult { accepted: number; rejected: { symbol: string; reason: string }[]; replayed: boolean }
export async function ingestScan(pool: pg.Pool, payload: ScanPayload): Promise<IngestResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(516377496)");
    const valid = await client.query<{ ticker: string }>("SELECT ticker FROM instruments WHERE ticker=ANY($1::text[])", [payload.tickers.map((item) => item.symbol)]);
    const known = new Set(valid.rows.map((row) => row.ticker));
    const rejected = payload.tickers.filter((item) => !known.has(item.symbol)).map((item) => ({ symbol: item.symbol, reason: "Unknown instrument" }));
    const started = await client.query("INSERT INTO scan_runs (run_id,as_of,generated_at,runner) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING run_id", [payload.runId, payload.asOf, payload.generatedAt, JSON.stringify(payload.runner)]);
    if (!started.rowCount) { await client.query("COMMIT"); return { accepted: 0, rejected: [], replayed: true }; }
    for (const item of payload.tickers.filter((ticker) => known.has(ticker.symbol))) {
      await client.query("UPDATE scan_findings SET superseded_by=$1 WHERE symbol=$2 AND as_of=$3 AND runner->>'name'=$4 AND superseded_by IS NULL", [payload.runId, item.symbol, payload.asOf, payload.runner.name]);
      await client.query(`INSERT INTO scan_findings (run_id,as_of,symbol,fundamentals,evidence,confidence,runner)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb)`, [payload.runId, payload.asOf, item.symbol, JSON.stringify(item.fundamentals), JSON.stringify({ items: item.evidence, flags: tickerEvidenceFlags(item) }), item.confidence, JSON.stringify(payload.runner)]);
    }
    await client.query("UPDATE macro_findings SET superseded_by=$1 WHERE as_of=$2 AND data->>'runnerName'=$3 AND superseded_by IS NULL", [payload.runId, payload.asOf, payload.runner.name]);
    await client.query("INSERT INTO macro_findings (run_id,as_of,data,evidence) VALUES ($1,$2,$3::jsonb,$4::jsonb)", [payload.runId, payload.asOf, JSON.stringify({ ...payload.macro, runnerName: payload.runner.name }), JSON.stringify({ items: payload.macro.evidence, flags: macroEvidenceFlags(payload.macro) })]);
    await client.query("COMMIT");
    return { accepted: payload.tickers.length - rejected.length, rejected, replayed: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
