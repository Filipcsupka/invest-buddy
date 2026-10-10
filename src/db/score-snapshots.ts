import { createHash } from "node:crypto";
import type { Fundamentals, Macro, OHLCV, ScoreResult } from "../engine";

/** Closes covered by bars_hash. */
export const SNAPSHOT_BARS = 260;

/** What the score read besides bars: the audit inputs and the consensus rows behind them. */
export interface SnapshotInputs {
  fundamentals: Fundamentals;
  macro: Macro;
  consensusRows?: unknown;
  consensusValues?: Record<string, boolean | null>;
  agreement?: Record<string, string>;
  scanRunIds?: Record<string, string>;
  sources?: ScoreResult["sources"];
  carriedFrom?: Record<string, string>;
  expiredFields?: string[];
}

export interface SnapshotRow {
  ticker: string;
  asOf: string;
  rulesVersion: string;
  inputsFingerprint: string;
  inputs: SnapshotInputs;
  barsHash: string;
  barLastDate: string | null;
}

export function barsHash(bars: OHLCV[], throughDate?: string) {
  const closes = bars.filter((bar) => !throughDate || bar.date <= throughDate).slice(-SNAPSHOT_BARS).map((bar) => [bar.date, bar.close]);
  return createHash("sha256").update(JSON.stringify(closes)).digest("hex");
}

export function fingerprintKey(key: string) {
  return /^[0-9a-f]{64}$/.test(key) ? key : createHash("sha256").update(key).digest("hex");
}

export function snapshotFor(result: ScoreResult, key: string, rulesVersion: string, extra?: Partial<SnapshotInputs>): SnapshotRow {
  const inputs: SnapshotInputs = {
    fundamentals: result.inputs.fundamentals,
    macro: result.inputs.macro,
    ...(result.consensusValues ? { consensusValues: result.consensusValues } : {}),
    ...(result.agreement ? { agreement: result.agreement } : {}),
    ...(result.scanRunIds ? { scanRunIds: result.scanRunIds } : {}),
    ...(result.sources ? { sources: result.sources } : {}),
    ...(result.carriedFrom ? { carriedFrom: result.carriedFrom } : {}),
    ...(result.expiredFields ? { expiredFields: result.expiredFields } : {}),
    ...extra,
  };
  return { ticker: result.ticker, asOf: result.asOf, rulesVersion, inputsFingerprint: fingerprintKey(key), inputs, barsHash: barsHash(result.inputs.bars, result.asOf), barLastDate: result.inputs.bars.filter((bar) => bar.date <= result.asOf).at(-1)?.date ?? null };
}
