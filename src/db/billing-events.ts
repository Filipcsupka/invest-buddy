import type pg from "pg";
import type { UserId } from "./users";

/** Returns false when a provider event was already recorded. */
export async function recordBillingEvent(db: Pick<pg.Pool, "query">, event: { userId: UserId; provider: string; eventId: string; type: string; payload: unknown }): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO billing_events (user_id, provider, event_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (provider, event_id) DO NOTHING`,
    [event.userId, event.provider, event.eventId, event.type, JSON.stringify(event.payload)],
  );
  return (result.rowCount ?? 0) === 1;
}
