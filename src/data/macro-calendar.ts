import type pg from "pg";
import { isSession, sessionsBetween } from "./trading-calendar";

/**
 * High-impact US macro events. Flag only: a nearby event adds a note to a buy signal, it never changes an action or a size tier.
 * The macro-calendar job stores the BLS release schedule (bls.gov/schedule/news_release/{cpi,ppi,empsit}.htm) and the Fed calendar
 * (federalreserve.gov/json/calendar.json, FOMC decision day) in `macro_events`. MACRO_EVENTS below is the fallback when that table is
 * empty or unreadable; its dates were checked 2026-10-15 against the same pages.
 */
export const MACRO_EVENT_KINDS = ["CPI", "PPI", "NFP", "FOMC"] as const;
export type MacroEventKind = (typeof MACRO_EVENT_KINDS)[number];
export interface MacroEvent { date: string; kind: MacroEventKind | "EARNINGS"; label: string }

export const MACRO_EVENTS: readonly MacroEvent[] = [
  { date: "2026-10-28", kind: "FOMC", label: "FOMC decision" },
  { date: "2026-11-06", kind: "NFP", label: "Jobs report (October)" },
  { date: "2026-11-10", kind: "CPI", label: "CPI (October)" },
  { date: "2026-11-13", kind: "PPI", label: "PPI (October)" },
  { date: "2026-12-04", kind: "NFP", label: "Jobs report (November)" },
  { date: "2026-12-09", kind: "FOMC", label: "FOMC decision" },
  { date: "2026-12-10", kind: "CPI", label: "CPI (November)" },
  { date: "2026-12-15", kind: "PPI", label: "PPI (November)" },
];

export const EVENT_WINDOW_SESSIONS = 3;

/**
 * Stored events win. For each kind, a fallback row is kept only when it is dated after the newest stored row of that kind,
 * so a moved release replaces the fallback date and a kind the job has not stored yet still shows its fallback dates.
 */
export function mergeMacroEvents(stored: readonly MacroEvent[], fallback: readonly MacroEvent[] = MACRO_EVENTS): MacroEvent[] {
  const newest = new Map<string, string>();
  for (const event of stored) if ((newest.get(event.kind) ?? "") < event.date) newest.set(event.kind, event.date);
  const kept = fallback.filter((event) => { const last = newest.get(event.kind); return !last || event.date > last; });
  return [...stored, ...kept].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Stored events on or after `from` merged with the fallback list. A missing table or a failed read gives the fallback list alone. */
export async function loadMacroEvents(db: Pick<pg.Pool, "query"> | null, from: string): Promise<MacroEvent[]> {
  if (!db) return [...MACRO_EVENTS];
  try {
    const result = await db.query<{ kind: string; event_date: string; label: string }>(
      "SELECT kind, event_date::text AS event_date, label FROM macro_events WHERE event_date >= $1::date ORDER BY event_date, kind", [from]);
    const stored = result.rows.flatMap((row): MacroEvent[] => (MACRO_EVENT_KINDS as readonly string[]).includes(row?.kind) && ISO_DATE.test(row?.event_date ?? "") && typeof row.label === "string"
      ? [{ date: row.event_date, kind: row.kind as MacroEventKind, label: row.label }] : []);
    return mergeMacroEvents(stored);
  } catch {
    return [...MACRO_EVENTS];
  }
}

export interface UpcomingEvent extends MacroEvent { sessions: number }

/**
 * Events on or after `asOf` within `windowSessions` NYSE sessions (0 = same day). `events` is the calendar to use (from loadMacroEvents;
 * the fallback list when left out). Extra events, such as mega-cap earnings, can be passed in.
 */
export function upcomingMacroEvents(asOf: string, windowSessions = EVENT_WINDOW_SESSIONS, extra: readonly MacroEvent[] = [], events: readonly MacroEvent[] = MACRO_EVENTS): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  for (const event of [...events, ...extra]) {
    if (event.date < asOf) continue;
    // sessionsBetween is inclusive of both ends, so drop the start day when it is itself a session.
    const sessions = Math.max(sessionsBetween(asOf, event.date).length - (isSession(asOf) ? 1 : 0), 0);
    if (sessions <= windowSessions) out.push({ ...event, sessions });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export function eventNote(events: readonly UpcomingEvent[]): string | null {
  if (!events.length) return null;
  const parts = events.map((e) => `${e.label} ${e.date} (${e.sessions === 0 ? "today" : `in ${e.sessions} session${e.sessions === 1 ? "" : "s"}`})`);
  return `Macro event risk: ${parts.join("; ")}. Signal unchanged; consider waiting for the release.`;
}
