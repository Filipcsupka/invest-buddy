import type pg from "pg";
import { flags } from "@/config/flags";

export const TRIAL_DAYS = 14;

/**
 * Plus trial for a new account, no card. Gated by TRIAL only, so it can run while BILLING is off.
 * One entitlement row per user makes the grant idempotent, including after expiry; an expired row reads as Free.
 */
export async function grantFirstTrial(db: Pick<pg.Pool, "query">, userId: string, now = new Date()): Promise<boolean> {
  if (!flags().TRIAL) return false;
  const end = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  const result = await db.query(
    `INSERT INTO entitlements (user_id, tier, status, source, starts_at, ends_at)
     VALUES ($1, 'plus', 'active', 'manual', $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, now, end],
  );
  return result.rowCount === 1;
}
