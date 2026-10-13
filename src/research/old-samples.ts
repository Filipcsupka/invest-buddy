/**
 * RS8: the six sample cards of the old automation, used to judge the new engine (docs/research-eval.md).
 * The fixture holds the trigger fact only. No amounts and nothing from the owner's portfolio.
 * Same style as validateResearchOutput in types.ts: a list of errors, empty when valid.
 */
import { FINDING_KINDS, type FindingKind } from "./types";

export const OLD_ACTIONS = ["START", "WATCH"] as const;
export type OldAction = (typeof OLD_ACTIONS)[number];

export interface OldSample {
  ticker: string;
  /** Null when the old sample file gave no day. dateNote says why. */
  cardDate: string | null;
  dateNote: string;
  /** The trigger fact in one line, without amounts. */
  trigger: string;
  kind: FindingKind;
  oldAction: OldAction;
}

export interface OldSamples { schemaVersion: 1; source: string; samples: OldSample[] }

const TICKER = /^[A-Z][A-Z0-9]*(?:\.[A-Z]{1,3})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /\b(?:EUR|USD)\b|[€$]|\bA\$|\bbn\b|\bmillion\b/i;
const KEYS = ["ticker", "cardDate", "dateNote", "trigger", "kind", "oldAction"];

const validDate = (value: string) => DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateOldSamples(value: unknown): string[] {
  const errs: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["$: expected an object"];
  const root = value as Record<string, unknown>;
  if (root.schemaVersion !== 1) errs.push("$.schemaVersion: expected 1");
  if (typeof root.source !== "string" || !root.source) errs.push("$.source: expected a non-empty string");
  if (!Array.isArray(root.samples)) return [...errs, "$.samples: expected an array"];
  if (root.samples.length !== 6) errs.push(`$.samples: expected 6 samples, got ${root.samples.length}`);
  const seen = new Set<string>();
  root.samples.forEach((raw, i) => {
    const at = `$.samples[${i}]`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { errs.push(`${at}: expected an object`); return; }
    const s = raw as Record<string, unknown>;
    for (const key of Object.keys(s)) if (!KEYS.includes(key)) errs.push(`${at}.${key}: unknown field`);
    if (typeof s.ticker !== "string" || !TICKER.test(s.ticker)) errs.push(`${at}.ticker: expected an uppercase ticker`);
    else if (seen.has(s.ticker)) errs.push(`${at}.ticker: duplicate ${s.ticker}`);
    else seen.add(s.ticker);
    if (s.cardDate !== null && (typeof s.cardDate !== "string" || !validDate(s.cardDate))) errs.push(`${at}.cardDate: expected a real YYYY-MM-DD date or null`);
    if (typeof s.dateNote !== "string" || !s.dateNote) errs.push(`${at}.dateNote: expected a non-empty string`);
    else if (s.cardDate === null && !/no day/i.test(s.dateNote)) errs.push(`${at}.dateNote: a null cardDate must say that no day was given`);
    if (typeof s.trigger !== "string" || !s.trigger.trim()) errs.push(`${at}.trigger: expected a non-empty string`);
    else if (AMOUNT.test(s.trigger)) errs.push(`${at}.trigger: no amounts in the trigger line`);
    if (!FINDING_KINDS.includes(s.kind as FindingKind)) errs.push(`${at}.kind: expected one of ${FINDING_KINDS.join(", ")}`);
    if (!OLD_ACTIONS.includes(s.oldAction as OldAction)) errs.push(`${at}.oldAction: expected START or WATCH`);
  });
  return errs;
}

export function isOldSamples(value: unknown): value is OldSamples { return validateOldSamples(value).length === 0; }
