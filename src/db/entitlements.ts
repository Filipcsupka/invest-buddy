import type pg from "pg";
import type { UserId } from "./users";

export type Tier = "free" | "plus";
export type EntitlementStatus = "active" | "canceled" | "expired";
export interface Entitlement {
  userId: UserId;
  tier: Tier;
  status: EntitlementStatus;
  source: "manual" | "stripe" | null;
  startsAt: Date | null;
  endsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

interface Row {
  user_id: string;
  tier: Tier;
  status: EntitlementStatus;
  source: "manual" | "stripe";
  starts_at: Date;
  ends_at: Date | null;
  cancel_at_period_end: boolean;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
}

const toEntitlement = (row: Row): Entitlement => ({
  userId: row.user_id, tier: row.tier, status: row.status, source: row.source,
  startsAt: row.starts_at, endsAt: row.ends_at,
  cancelAtPeriodEnd: row.cancel_at_period_end,
  providerCustomerId: row.provider_customer_id,
  providerSubscriptionId: row.provider_subscription_id,
});

/** One indexed row lookup. Canceled access lasts through the paid period. */
export async function getEntitlement(db: Pick<pg.Pool, "query">, userId: UserId, at = new Date()): Promise<Entitlement> {
  const result = await db.query<Row>(
    `SELECT user_id::text, tier, status, source, starts_at, ends_at,
            cancel_at_period_end, provider_customer_id, provider_subscription_id
     FROM entitlements WHERE user_id = $1`, [userId],
  );
  const row = result.rows[0];
  const active = row?.status === "active" || (row?.status === "canceled" && row.cancel_at_period_end && row.ends_at !== null);
  if (row && active && row.starts_at <= at && (!row.ends_at || row.ends_at > at)) return toEntitlement(row);
  return { userId, tier: "free", status: row?.status ?? "active", source: row?.source ?? null,
    startsAt: row?.starts_at ?? null, endsAt: row?.ends_at ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    providerCustomerId: row?.provider_customer_id ?? null, providerSubscriptionId: row?.provider_subscription_id ?? null };
}

/** Manual grants cannot overwrite a Stripe managed subscription. */
export async function setEntitlement(db: Pick<pg.Pool, "query">, input: { userId: UserId; tier: Tier; endsAt?: Date | null; startsAt?: Date }): Promise<Entitlement> {
  const result = await db.query<Row>(
    `INSERT INTO entitlements (user_id, tier, status, source, starts_at, ends_at)
     VALUES ($1, $2, 'active', 'manual', $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, status = 'active', source = 'manual',
       starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
       cancel_at_period_end = false, provider_customer_id = NULL, provider_subscription_id = NULL,
       updated_at = now()
     WHERE entitlements.source = 'manual'
     RETURNING user_id::text, tier, status, source, starts_at, ends_at,
       cancel_at_period_end, provider_customer_id, provider_subscription_id`,
    [input.userId, input.tier, input.startsAt ?? new Date(), input.endsAt ?? null],
  );
  if (!result.rows[0]) throw new Error("Stripe entitlement cannot be changed by a manual grant");
  return toEntitlement(result.rows[0]);
}
