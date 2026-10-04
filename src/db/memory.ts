import type { ScoreResult } from "../engine";
import type { AlertChange, SaveOutcome, ScoreRepository, ScoredInstrument } from "./types";
import { stateChange } from "./types";

export class MemoryScoreRepository implements ScoreRepository {
  private readonly completed = new Set<string>();
  private readonly results = new Map<string, Map<string, ScoreResult>>();
  private readonly changes = new Map<string, AlertChange[]>();

  async saveDaily(asOf: string, _provider: string, records: ScoredInstrument[]): Promise<SaveOutcome> {
    if (this.completed.has(asOf)) return { inserted: false, instrumentCount: 0, alerts: [] };
    const tickers = new Set<string>();
    const alerts: AlertChange[] = [];
    const current = new Map<string, ScoreResult>();
    for (const { instrument, result } of records) {
      if (instrument.ticker !== result.ticker || result.asOf !== asOf || tickers.has(result.ticker)) throw new Error("Invalid daily score batch");
      tickers.add(result.ticker);
      const prior = [...this.results.entries()]
        .filter(([date]) => date < asOf).sort(([a], [b]) => b.localeCompare(a))
        .map(([, scores]) => scores.get(result.ticker)).find((score) => score !== undefined) ?? null;
      const change = stateChange(prior, result);
      if (change) alerts.push(change);
      current.set(result.ticker, structuredClone(result));
    }
    this.results.set(asOf, current);
    this.changes.set(asOf, alerts);
    this.completed.add(asOf);
    return { inserted: true, instrumentCount: records.length, alerts: structuredClone(alerts) };
  }

  async scores(asOf: string) { return structuredClone([...this.results.get(asOf)?.values() ?? []]); }
  async alerts(asOf: string) { return structuredClone(this.changes.get(asOf) ?? []); }
}
