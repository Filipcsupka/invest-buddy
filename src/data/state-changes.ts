import { cache } from "react";
import type { AlertState } from "@/engine";
import { stateKey, type StateKey } from "@/i18n/score-text";
import { getPool } from "../db/pool";

export interface StateChangeRow { ticker: string; from: StateKey; to: StateKey; asOf: string }

type Snapshot = { ticker: string; asOf: string; state: AlertState };

/** Tickers whose stored state differs between their newest and the previous snapshot. Pure, so it is testable without a database. */
export function diffStates(rows: readonly Snapshot[], newest: string | null = null): StateChangeRow[] {
  const byTicker = new Map<string, Snapshot[]>();
  for (const row of rows) byTicker.set(row.ticker, [...(byTicker.get(row.ticker) ?? []), row]);
  const out: StateChangeRow[] = [];
  for (const [ticker, list] of byTicker) {
    const [latest, previous] = [...list].sort((a, b) => b.asOf.localeCompare(a.asOf));
    if (!latest || !previous || (newest && latest.asOf !== newest)) continue;
    const to = stateKey(latest.state), from = stateKey(previous.state);
    if (to !== from) out.push({ ticker, from, to, asOf: latest.asOf });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Changes on the newest scan day against the scan before it. Empty in fixture mode, without a database, and on a read failure. */
async function latestStateChangesUncached(): Promise<StateChangeRow[]> {
  if (process.env.DATA_MODE === "fixture" || !process.env.DATABASE_URL) return [];
  const db = getPool(); if (!db) return [];
  try {
    const result = await db.query<Snapshot>(`SELECT ticker, as_of::text AS "asOf", state FROM (
        SELECT ticker, as_of, state, row_number() OVER (PARTITION BY ticker ORDER BY as_of DESC) AS rn
        FROM score_results WHERE audit ? 'scanRunId' AND as_of >= CURRENT_DATE - 21) t WHERE rn <= 2`);
    const newest = result.rows.map((row) => row.asOf).sort().at(-1) ?? null;
    return diffStates(result.rows, newest);
  } catch { return []; }
}
export const latestStateChanges = cache(latestStateChangesUncached);
