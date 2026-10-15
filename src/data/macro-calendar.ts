import { isSession, sessionsBetween } from "./trading-calendar";

/**
 * High-impact US macro events. Flag only: a nearby event adds a note to a buy signal, it never changes an action or a size tier.
 * Dates checked 2026-10-15 against the BLS release schedule (bls.gov/schedule/news_release/{cpi,ppi,empsit}.htm, which lists October 2026 onward)
 * and the Fed calendar (federalreserve.gov/json/calendar.json, FOMC decision day). Add the next year's rows when the agencies publish them.
 */
export interface MacroEvent { date: string; kind: "CPI" | "PPI" | "NFP" | "FOMC" | "EARNINGS"; label: string }

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

export interface UpcomingEvent extends MacroEvent { sessions: number }

/** Events on or after `asOf` within `windowSessions` NYSE sessions (0 = same day). Extra events, such as mega-cap earnings, can be passed in. */
export function upcomingMacroEvents(asOf: string, windowSessions = EVENT_WINDOW_SESSIONS, extra: readonly MacroEvent[] = []): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  for (const event of [...MACRO_EVENTS, ...extra]) {
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
