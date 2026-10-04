import pg from "pg";
import type { ScoreResult } from "../engine";
import type { AlertChange, SaveOutcome, ScoreRepository, ScoredInstrument } from "./types";
import { stateChange } from "./types";

export class PostgresScoreRepository implements ScoreRepository {
  constructor(private readonly pool: pg.Pool) {}

  async saveDaily(asOf: string, provider: string, records: ScoredInstrument[]): Promise<SaveOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const started = await client.query("INSERT INTO ingest_runs (as_of, provider, instrument_count, alert_count) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING RETURNING as_of", [asOf, provider, records.length]);
      if (!started.rowCount) {
        await client.query("COMMIT");
        return { inserted: false, instrumentCount: 0, alerts: [] };
      }
      const tickers = new Set<string>();
      const alerts: AlertChange[] = [];
      for (const { instrument, result } of records) {
        if (instrument.ticker !== result.ticker || result.asOf !== asOf || tickers.has(result.ticker)) throw new Error("Invalid daily score batch");
        tickers.add(result.ticker);
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
        await client.query(`INSERT INTO score_results (ticker,as_of,technical,fundamentals,macro,total,state,audit)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [result.ticker, asOf, result.technical, result.fundamentals, result.macro, result.total, result.state, JSON.stringify(result)]);
        const change = stateChange(previous.rows[0] ?? null, result);
        if (change) {
          alerts.push(change);
          await client.query(`INSERT INTO alerts (ticker,as_of,previous_state,current_state,previous_score,current_score)
            VALUES ($1,$2,$3,$4,$5,$6)`, [change.ticker, change.asOf, change.previousState, change.currentState, change.previousScore, change.currentScore]);
        }
      }
      await client.query("UPDATE ingest_runs SET alert_count=$2 WHERE as_of=$1", [asOf, alerts.length]);
      await client.query("COMMIT");
      return { inserted: true, instrumentCount: records.length, alerts };
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
      "SELECT ticker,as_of::text,previous_state,current_state,previous_score,current_score FROM alerts WHERE as_of=$1 ORDER BY ticker", [asOf]);
    return result.rows.map((row) => ({ ticker: row.ticker, asOf: row.as_of, previousState: row.previous_state, currentState: row.current_state, previousScore: row.previous_score, currentScore: row.current_score }));
  }
}
