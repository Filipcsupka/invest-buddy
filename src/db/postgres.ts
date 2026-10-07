import pg from "pg";
import type { ScoreResult } from "../engine";
import type { AlertChange, SaveOutcome, ScoreRepository, ScoredInstrument } from "./types";
import { stateChange } from "./types";
import { SCORE_RULES_VERSION } from "../engine/score";
import { scoreSignal } from "../track-record/measure";

export class PostgresScoreRepository implements ScoreRepository {
  constructor(private readonly pool: pg.Pool) {}

  async saveDaily(asOf: string, provider: string, records: ScoredInstrument[]): Promise<SaveOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`score:${asOf}`]);
      let changed = false;
      const tickers = new Set<string>();
      const alerts: AlertChange[] = [];
      for (const { instrument, result, fingerprint } of records) {
        if (instrument.ticker !== result.ticker || result.asOf !== asOf || tickers.has(result.ticker)) throw new Error("Invalid daily score batch");
        tickers.add(result.ticker);
        const key = fingerprint ?? JSON.stringify(result);
        const existing = await client.query<{ inputs_fingerprint: string; state: ScoreResult["state"] }>("SELECT inputs_fingerprint,state FROM score_results WHERE ticker=$1 AND as_of=$2", [result.ticker, asOf]);
        if (existing.rows[0]?.inputs_fingerprint === key) continue;
        changed = true;
        await client.query(`INSERT INTO instruments (ticker, name, sector, tier, source) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (ticker) DO UPDATE SET name=EXCLUDED.name, sector=EXCLUDED.sector, tier=EXCLUDED.tier, source=EXCLUDED.source`,
          [instrument.ticker, instrument.name, instrument.sector, instrument.tier, instrument.source]);
        for (const bar of result.inputs.bars) {
          await client.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (ticker,bar_date) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`,
            [result.ticker, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume]);
        }
        await client.query(`INSERT INTO fundamentals_snapshots (ticker,as_of,data) VALUES ($1,$2,$3::jsonb)
          ON CONFLICT (ticker,as_of) DO UPDATE SET data=EXCLUDED.data`, [result.ticker, asOf, JSON.stringify(result.inputs.fundamentals)]);
        await client.query(`INSERT INTO macro_snapshots (ticker,as_of,data) VALUES ($1,$2,$3::jsonb)
          ON CONFLICT (ticker,as_of) DO UPDATE SET data=EXCLUDED.data`, [result.ticker, asOf, JSON.stringify(result.inputs.macro)]);
        const previous = await client.query<{ state: ScoreResult["state"]; total: number }>(
          "SELECT state,total FROM score_results WHERE ticker=$1 AND as_of < $2 ORDER BY as_of DESC LIMIT 1", [result.ticker, asOf]);
        await client.query(`INSERT INTO score_results (ticker,as_of,technical,fundamentals,macro,total,state,audit,inputs_fingerprint)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
          ON CONFLICT (ticker,as_of) DO UPDATE SET technical=EXCLUDED.technical,fundamentals=EXCLUDED.fundamentals,macro=EXCLUDED.macro,total=EXCLUDED.total,state=EXCLUDED.state,audit=EXCLUDED.audit,inputs_fingerprint=EXCLUDED.inputs_fingerprint`,
          [result.ticker, asOf, result.technical, result.fundamentals, result.macro, result.total, result.state, JSON.stringify(result), key]);
        // Only scan-backed rows enter the public record. The first observation for a date stays fixed on reruns.
        const runIds = [...new Set(Object.values(result.scanRunIds ?? {}).concat(result.scanRunId ? [result.scanRunId] : []))];
        const provenance = runIds.length ? await client.query<{ found: number; all_real: boolean }>(
          "SELECT count(*)::int AS found,coalesce(bool_and(runner->>'dataMode'='real' AND runner->>'model'<>'local-sample'),false) AS all_real FROM scan_runs WHERE run_id = ANY($1::uuid[])", [runIds]) : null;
        if (provider === "scan" && runIds.length > 0 && provenance?.rows[0]?.found === runIds.length && provenance.rows[0].all_real) {
          const close = result.inputs.bars.findLast((bar) => bar.date === asOf)?.close ?? null;
          const sameDayRecorded = await client.query<{ state: ScoreResult["state"] }>(
            "SELECT state FROM record_snapshots WHERE ticker=$1 AND as_of=$2", [result.ticker, asOf]);
          await client.query(`INSERT INTO record_snapshots (ticker,as_of,score,state,rule_hits,rules_version,reference_close)
            VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (ticker,as_of) DO NOTHING`,
          [result.ticker, asOf, result.total, result.state, JSON.stringify(result.ruleHits.filter((hit) => hit.matched).map((hit) => ({ id: hit.id, points: hit.points }))), SCORE_RULES_VERSION, close]);
          const previousReal = await client.query<{ state: ScoreResult["state"] }>(
            "SELECT state FROM record_snapshots WHERE ticker=$1 AND as_of < $2 ORDER BY as_of DESC LIMIT 1", [result.ticker, asOf]);
          const tier = scoreSignal(sameDayRecorded.rows.length ? existing.rows[0]?.state ?? sameDayRecorded.rows[0].state : previousReal.rows[0]?.state ?? null, result.state);
          if (tier && close !== null) await client.query(`INSERT INTO record_signals (ticker,as_of,source,event_key,tier,state,score,rules_version,reference_close,spy_reference_close)
            VALUES ($1,$2,'score',$3,$4,$5,$6,$7,$8,(SELECT close FROM daily_bars WHERE ticker='SPY' AND bar_date=$2))
            ON CONFLICT (ticker,as_of,source,event_key) DO NOTHING`,
          [result.ticker, asOf, key, tier, result.state, result.total, SCORE_RULES_VERSION, close]);
        }
        const change = stateChange(previous.rows[0] ?? null, result);
        if (change) {
          alerts.push(change);
          await client.query(`INSERT INTO alerts (ticker,as_of,previous_state,current_state,previous_score,current_score,active)
            VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (ticker,as_of) DO UPDATE SET previous_state=EXCLUDED.previous_state,current_state=EXCLUDED.current_state,previous_score=EXCLUDED.previous_score,current_score=EXCLUDED.current_score,active=true`, [change.ticker, change.asOf, change.previousState, change.currentState, change.previousScore, change.currentScore]);
        } else {
          await client.query("UPDATE alerts SET active=false WHERE ticker=$1 AND as_of=$2", [result.ticker, asOf]);
        }
      }
      const alertCount = changed ? Number((await client.query<{ count: string }>("SELECT count(*)::text AS count FROM alerts WHERE as_of=$1 AND active=true", [asOf])).rows[0].count) : 0;
      if (changed) await client.query(`INSERT INTO ingest_runs (as_of,provider,instrument_count,alert_count) VALUES ($1,$2,$3,$4)
        ON CONFLICT (as_of) DO UPDATE SET provider=EXCLUDED.provider,instrument_count=EXCLUDED.instrument_count,alert_count=EXCLUDED.alert_count,completed_at=now()`, [asOf,provider,records.length,alertCount]);
      await client.query("COMMIT");
      return { inserted: changed, instrumentCount: changed ? records.length : 0, alerts };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async scores(asOf: string): Promise<ScoreResult[]> {
    const result = await this.pool.query<{ audit: ScoreResult }>("SELECT audit FROM score_results WHERE as_of=$1 ORDER BY ticker", [asOf]);
    return result.rows.map((row) => row.audit);
  }

  async alerts(asOf: string): Promise<AlertChange[]> {
    const result = await this.pool.query<{ ticker: string; as_of: string; previous_state: ScoreResult["state"]; current_state: ScoreResult["state"]; previous_score: number; current_score: number }>(
      "SELECT ticker,as_of::text,previous_state,current_state,previous_score,current_score FROM alerts WHERE as_of=$1 AND active=true ORDER BY ticker", [asOf]);
    return result.rows.map((row) => ({ ticker: row.ticker, asOf: row.as_of, previousState: row.previous_state, currentState: row.current_state, previousScore: row.previous_score, currentScore: row.current_score }));
  }
}
