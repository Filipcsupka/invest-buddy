import { FEATURE_TIERS, TIERS, type TierId } from "@/config/tiers";

/** Paid ids that already work in the beta. The rest are planned and say so. */
export const LIVE_PAID: ReadonlySet<TierId> = new Set<TierId>(["score-history", "scanner-filters-advanced", "scanner-streak", "insiders-history"]);

/** Every id the tier config marks as paid, in the order the copy lists them. A paid id without a copy row is caught by the pricing page test. */
export function paidIds(order: string[]): TierId[] {
  const entries: [string, { tier: string }][] = [...Object.entries(TIERS), ...Object.entries(FEATURE_TIERS)];
  const paid = new Set(entries.filter(([, entry]) => entry.tier === "paid").map(([id]) => id));
  return order.filter((id) => paid.has(id)) as TierId[];
}
