import type { ScoreResult } from "../engine";
import type { AlertChange, SaveOutcome, ScoreRepository, ScoredInstrument } from "./types";
import { stateChange } from "./types";
import { snapshotFor, type SnapshotRow } from "./score-snapshots";
import { SCORE_RULES_VERSION } from "../engine/score";

export class MemoryScoreRepository implements ScoreRepository {
  private readonly fingerprints = new Map<string, Map<string, string>>();
  private readonly results = new Map<string, Map<string, ScoreResult>>();
  readonly snapshots: SnapshotRow[] = [];
  private readonly changes = new Map<string, AlertChange[]>();

  async saveDaily(asOf: string, _provider: string, records: ScoredInstrument[]): Promise<SaveOutcome> {
    const current = new Map(this.results.get(asOf) ?? []);
    const fingerprints = new Map(this.fingerprints.get(asOf) ?? []);
    const tickers = new Set<string>();
    let changed = false;
    for (const { instrument, result, fingerprint, consensusRows } of records) {
      if (instrument.ticker !== result.ticker || result.asOf !== asOf || tickers.has(result.ticker)) throw new Error("Invalid daily score batch");
      tickers.add(result.ticker);
      const key = fingerprint ?? JSON.stringify(result);
      if (fingerprints.get(result.ticker) === key) continue;
      const snapshot = snapshotFor(result, key, SCORE_RULES_VERSION, { consensusRows });
      if (!this.snapshots.some((row) => row.ticker === snapshot.ticker && row.asOf === snapshot.asOf && row.inputsFingerprint === snapshot.inputsFingerprint)) this.snapshots.push(structuredClone(snapshot));
      current.set(result.ticker, structuredClone(result));
      fingerprints.set(result.ticker, key);
      changed = true;
    }
    if (!changed) return { inserted: false, instrumentCount: 0, alerts: [] };
    const alerts: AlertChange[] = [];
    for (const result of current.values()) {
      const prior = [...this.results.entries()]
        .filter(([date]) => date < asOf).sort(([a], [b]) => b.localeCompare(a))
        .map(([, scores]) => scores.get(result.ticker)).find((score) => score !== undefined) ?? null;
      const change = stateChange(prior, result);
      if (change) alerts.push(change);
    }
    this.results.set(asOf, current);
    this.fingerprints.set(asOf, fingerprints);
    this.changes.set(asOf, alerts);
    return { inserted: true, instrumentCount: records.length, alerts: structuredClone(alerts) };
  }

  async scores(asOf: string) { return structuredClone([...this.results.get(asOf)?.values() ?? []]); }
  async alerts(asOf: string) { return structuredClone(this.changes.get(asOf) ?? []); }
}
