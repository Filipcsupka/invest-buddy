import type { InsiderEvent } from "@/db/insiders";

/** Keeps events whose transaction date is within `days` of `now`. A null limit keeps everything (paid and admin). */
export function withinDays(events: InsiderEvent[], days: number | null, now: Date = new Date()): InsiderEvent[] {
  if (days === null) return events;
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return events.filter((event) => event.transactionDate >= cutoff);
}
