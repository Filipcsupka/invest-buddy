import type { ScoreResult } from "../engine";
import type { Instrument } from "../data/providers";

export interface ScoredInstrument { instrument: Instrument; result: ScoreResult }
export interface AlertChange {
  ticker: string;
  asOf: string;
  previousState: ScoreResult["state"] | null;
  currentState: ScoreResult["state"];
  previousScore: number | null;
  currentScore: number;
}
export interface SaveOutcome { inserted: boolean; instrumentCount: number; alerts: AlertChange[] }
export interface ScoreRepository {
  saveDaily(asOf: string, provider: string, records: ScoredInstrument[]): Promise<SaveOutcome>;
  scores(asOf: string): Promise<ScoreResult[]>;
  alerts(asOf: string): Promise<AlertChange[]>;
}

export function stateChange(previous: Pick<ScoreResult, "state" | "total"> | null, current: ScoreResult): AlertChange | null {
  if (!previous || previous.state === current.state) return null;
  return { ticker: current.ticker, asOf: current.asOf, previousState: previous.state,
    currentState: current.state, previousScore: previous.total, currentScore: current.total };
}
