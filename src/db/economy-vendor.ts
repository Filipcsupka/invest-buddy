import type pg from "pg";

/**
 * Tolerant readers for the EODHD macro and flow payloads (economy, news, congress). Beta endpoints can change shape:
 * unknown fields are ignored, and a row that lacks a required field is skipped and counted, never guessed.
 */
export interface Parsed<T> { rows: T[]; skipped: number }

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** A calendar day that exists, written YYYY-MM-DD. */
export function isoDay(value: unknown): string | null {
  const day = text(value)?.slice(0, 10);
  if (!day || !ISO_DAY.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

export const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Sum of the client's per-endpoint estimates. */
export const totalCalls = (costs: Record<string, number>) => Object.values(costs).reduce((sum, value) => sum + value, 0);

/** Calls already logged today for one job in eodhd_call_log, so a rerun on the same day shares the daily cap. */
export async function callsLoggedToday(db: Pick<pg.Pool, "query"> | null, job: string): Promise<number> {
  if (!db) return 0;
  const result = await db.query<{ calls: number }>("SELECT calls FROM eodhd_call_log WHERE job=$1 AND run_date=CURRENT_DATE", [job]);
  return Number(result.rows[0]?.calls ?? 0);
}

/** Per-run spending guard. `allow` reserves the cost of the next request or refuses it when the daily cap would be passed. */
export class CallBudget {
  private reserved = 0;
  capped = false;
  constructor(readonly cap: number, private readonly alreadyUsed = 0) {}
  allow(cost: number): boolean {
    if (this.alreadyUsed + this.reserved + cost > this.cap) { this.capped = true; return false; }
    this.reserved += cost;
    return true;
  }
  get planned(): number { return this.reserved; }
}

export function positiveInt(flag: string, raw: string | undefined, max = 100_000): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${flag} needs a whole number from 1 to ${max}`);
  return value;
}

export function list(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
