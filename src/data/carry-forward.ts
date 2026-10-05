import { freshnessDays } from "./evidence";

/** Off unless CARRY_FORWARD=on. With the flag off, reconcile and daily behave exactly as before. */
export const carryForwardEnabled = (env: Record<string, string | undefined> = process.env) => env.CARRY_FORWARD === "on";

export interface ConsensusRow {
  symbol?: string; field: string; as_of: string; value: boolean | null; agreement: string;
  agent_values: Record<string, { value?: boolean | null; runId: string }>; evidence_refs: { url: string; publishedAt?: string }[];
  verified: boolean; reason: string; carried_from?: string | null;
}
export type CarryState = { state: "fresh" } | { state: "carried"; carriedFrom: string; windowDays: number } | { state: "expired"; carriedFrom: string; windowDays: number };

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const ageDays = (from: string, to: string) => Math.floor((day(to) - day(from)) / 86_400_000);

/** Date the row's data came from: its own scan date, or the scan date it was copied from. */
export const originOf = (row: Pick<ConsensusRow, "as_of" | "carried_from">) => (row.carried_from ?? row.as_of).slice(0, 10);

/**
 * Date the freshness window counts from. A true claim carries its newest cited publication date (never later than the scan date),
 * because the claim was only as fresh as its evidence when it was verified. Everything else counts from the scan date.
 */
export function basisDate(row: Pick<ConsensusRow, "as_of" | "carried_from" | "value" | "evidence_refs">): string {
  const origin = originOf(row);
  if (row.value !== true) return origin;
  const dates = (row.evidence_refs ?? []).map((ref) => ref.publishedAt?.slice(0, 10)).filter((d): d is string => !!d && Number.isFinite(day(d)));
  if (!dates.length) return origin;
  const newest = dates.sort().at(-1) as string;
  return newest < origin ? newest : origin;
}

/** Fresh: scanned on the requested date. Otherwise carried while inside the field's window (same windows as evidence), then expired. */
export function carryState(row: ConsensusRow, asOf: string): CarryState {
  if (!row.carried_from && row.as_of.slice(0, 10) === asOf) return { state: "fresh" };
  const windowDays = freshnessDays[row.field] ?? 30;
  const carriedFrom = originOf(row);
  return ageDays(basisDate(row), asOf) > windowDays ? { state: "expired", carriedFrom, windowDays } : { state: "carried", carriedFrom, windowDays };
}

export interface CarriedField { symbol: string; field: string; asOf: string; value: boolean | null; agreement: string; agentValues: ConsensusRow["agent_values"]; evidenceRefs: ConsensusRow["evidence_refs"]; verified: boolean; reason: string; carriedFrom: string }

/** The consensus row to store for a symbol that has no findings on `asOf`. Expired fields become unknown with no evidence. */
export function carryField(row: ConsensusRow & { symbol: string }, asOf: string): CarriedField {
  const state = carryState(row, asOf);
  const carriedFrom = state.state === "fresh" ? row.as_of.slice(0, 10) : state.carriedFrom;
  if (state.state === "expired") {
    return { symbol: row.symbol, field: row.field, asOf, value: null, agreement: "single", agentValues: {}, evidenceRefs: [], verified: false, carriedFrom,
      reason: `Expired: last scanned ${carriedFrom}, outside the ${state.windowDays}-day window for ${row.field}` };
  }
  return { symbol: row.symbol, field: row.field, asOf, value: row.value, agreement: row.agreement, agentValues: row.agent_values, evidenceRefs: row.evidence_refs, verified: row.verified, carriedFrom,
    reason: row.carried_from && row.reason.startsWith("Carried from") ? row.reason : `Carried from ${carriedFrom}: ${row.reason}`.slice(0, 500) };
}
