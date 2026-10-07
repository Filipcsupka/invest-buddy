import pg from "pg";
import { judgeSignal, scoreSignal } from "../src/track-record/measure";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--write")) throw new Error("Usage: tsx scripts/backfill-track-record.ts [--write]");
const write = args.includes("--write");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

type ScoreRow = { ticker: string; as_of: string; total: number; state: string; inputs_fingerprint: string | null; audit: { scanRunId?: string; scanRunIds?: Record<string, string>; ruleHits?: { id: string; points: number; matched: boolean }[] }; close: string | null; spy_close: string | null };
type IdeaRow = { ticker: string; as_of: string; action: string; size_tier: string | null; rule_config_version: string; input_hash: string; agent: string; judge_run_id: string | null; close: string | null; spy_close: string | null };

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const rawScores = await client.query<ScoreRow>(`SELECT s.ticker,s.as_of::text,s.total,s.state,s.inputs_fingerprint,s.audit,p.close::text,spy.close::text AS spy_close
      FROM score_results s LEFT JOIN daily_bars p ON p.ticker=s.ticker AND p.bar_date=s.as_of
      LEFT JOIN daily_bars spy ON spy.ticker='SPY' AND spy.bar_date=s.as_of
      WHERE s.audit ? 'scanRunId' ORDER BY s.ticker,s.as_of`);
    const runIds = [...new Set(rawScores.rows.flatMap((row) => Object.values(row.audit.scanRunIds ?? {}).concat(row.audit.scanRunId ? [row.audit.scanRunId] : [])))];
    const runs = await client.query<{ run_id: string; model: string | null; data_mode: string | null }>("SELECT run_id::text,runner->>'model' AS model,runner->>'dataMode' AS data_mode FROM scan_runs WHERE run_id = ANY($1::uuid[])", [runIds]);
    const realRuns = new Set(runs.rows.filter((row) => row.data_mode === "real" && row.model !== "local-sample").map((row) => row.run_id));
    const scores = rawScores.rows.filter((row) => {
      const ids = [...new Set(Object.values(row.audit.scanRunIds ?? {}).concat(row.audit.scanRunId ? [row.audit.scanRunId] : []))];
      return ids.length > 0 && ids.every((id) => realRuns.has(id));
    });
    const scoreKeys = new Set(scores.map((row) => `${row.ticker}:${row.as_of}`));
    const ideas = await client.query<IdeaRow>(`SELECT i.symbol AS ticker,i.as_of::text,i.action,i.size_tier,i.rule_config_version,i.input_hash,i.agent,i.judge_run_id::text,p.close::text,spy.close::text AS spy_close
      FROM trade_ideas i LEFT JOIN daily_bars p ON p.ticker=i.symbol AND p.bar_date=i.as_of
      LEFT JOIN daily_bars spy ON spy.ticker='SPY' AND spy.bar_date=i.as_of
      WHERE i.action IN ('START_POSITION','ADD','HIGH_CONVICTION_ADD','THESIS_BROKEN') ORDER BY i.as_of,i.id`);
    const scoreEvents: { row: ScoreRow; tier: string }[] = [];
    const previous = new Map<string, string>();
    for (const row of scores) {
      const tier = scoreSignal(previous.get(row.ticker) ?? null, row.state);
      if (tier && row.close) scoreEvents.push({ row, tier });
      previous.set(row.ticker, row.state);
    }
    const missingPrice = scores.filter((row) => row.close === null).length;
    const eligibleIdeas = ideas.rows.filter((row) => judgeSignal(row.action) && scoreKeys.has(`${row.ticker}:${row.as_of}`));
    process.stdout.write(`${write ? "Writing" : "Dry run"}: ${scores.length} verified score snapshots, ${scoreEvents.length} score events, ${eligibleIdeas.length} dated judge ideas, ${missingPrice} snapshots and ${eligibleIdeas.filter((row) => row.close === null).length} ideas without an exact-date close. Skipped ${rawScores.rows.length - scores.length} scores with sample or missing scan provenance and ${ideas.rows.length - eligibleIdeas.length} ideas without a matching verified score. Historical score rules versions are unknown and stay null.\n`);
    if (!write) return;
    await client.query("BEGIN");
    let snapshotsWritten = 0;
    let eventsWritten = 0;
    for (const row of scores) {
      const rules = row.audit.ruleHits?.filter((hit) => hit.matched).map((hit) => ({ id: hit.id, points: hit.points })) ?? [];
      const inserted = await client.query(`INSERT INTO record_snapshots (ticker,as_of,score,state,rule_hits,rules_version,reference_close)
        VALUES ($1,$2,$3,$4,$5::jsonb,NULL,$6) ON CONFLICT (ticker,as_of) DO NOTHING`,
      [row.ticker, row.as_of, row.total, row.state, JSON.stringify(rules), row.close]);
      snapshotsWritten += inserted.rowCount ?? 0;
    }
    for (const { row, tier } of scoreEvents) {
      const inserted = await client.query(`INSERT INTO record_signals (ticker,as_of,source,event_key,tier,state,score,rules_version,reference_close,spy_reference_close)
        VALUES ($1,$2,'score',$3,$4,$5,$6,NULL,$7,$8) ON CONFLICT (ticker,as_of,source,event_key) DO NOTHING`,
      [row.ticker, row.as_of, row.inputs_fingerprint ?? `legacy:${row.ticker}:${row.as_of}`, tier, row.state, row.total, row.close, row.spy_close]);
      eventsWritten += inserted.rowCount ?? 0;
    }
    for (const row of eligibleIdeas) {
      const tier = row.action === "THESIS_BROKEN" ? "BROKEN" : row.size_tier ?? row.action;
      const inserted = await client.query(`INSERT INTO record_signals (ticker,as_of,source,event_key,tier,state,score,rules_version,reference_close,spy_reference_close)
        VALUES ($1,$2,'judge',$3,$4,$5,(SELECT score FROM record_snapshots WHERE ticker=$1 AND as_of=$2),$6,$7,$8)
        ON CONFLICT (ticker,as_of,source,event_key) DO NOTHING`,
      [row.ticker, row.as_of, row.judge_run_id ?? `${row.agent}:${row.input_hash}`, tier, row.action, row.rule_config_version, row.close, row.spy_close]);
      eventsWritten += inserted.rowCount ?? 0;
    }
    await client.query("COMMIT");
    process.stdout.write(`Inserted ${snapshotsWritten} snapshots and ${eventsWritten} events.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
