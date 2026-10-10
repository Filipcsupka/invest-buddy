import type { OHLCV, ScoreResult } from "../engine";
import { scoreAsOf } from "../engine/score-as-of";
import { barsHash, type SnapshotRow } from "./score-snapshots";

export interface ReplayReport {
  ok: boolean;
  barsMatch: boolean;
  replayed: { total: number; state: string; ruleHits: { id: string; points: number }[] };
  stored: { total: number; state: string; ruleHits: { id: string; points: number }[] } | null;
  differences: string[];
}

const hits = (result: Pick<ScoreResult, "ruleHits">) => result.ruleHits.filter((hit) => hit.matched).map((hit) => ({ id: hit.id, points: hit.points }));

/** Rebuilds the score from a snapshot and the bars of that date, and compares total, state and matched rule hits with the stored result. */
export function replaySnapshot(snapshot: SnapshotRow, bars: OHLCV[], stored: ScoreResult | null): ReplayReport {
  const barsMatch = barsHash(bars, snapshot.asOf) === snapshot.barsHash;
  const replay = scoreAsOf({ ticker: snapshot.ticker, bars, fundamentals: snapshot.inputs.fundamentals, macro: snapshot.inputs.macro }, snapshot.asOf);
  const replayed = { total: replay.total, state: replay.state, ruleHits: hits(replay) };
  const storedView = stored ? { total: stored.total, state: stored.state, ruleHits: hits(stored) } : null;
  const differences: string[] = [];
  if (!barsMatch) differences.push("bars differ from the snapshot bars_hash (stored bars were changed or are incomplete)");
  if (!storedView) differences.push("no stored score for this ticker and date");
  else {
    if (storedView.total !== replayed.total) differences.push(`total ${storedView.total} stored, ${replayed.total} replayed`);
    if (storedView.state !== replayed.state) differences.push(`state ${storedView.state} stored, ${replayed.state} replayed`);
    if (JSON.stringify(storedView.ruleHits) !== JSON.stringify(replayed.ruleHits)) differences.push("matched rule hits differ");
  }
  return { ok: differences.length === 0, barsMatch, replayed, stored: storedView, differences };
}
