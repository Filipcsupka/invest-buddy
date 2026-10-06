import type { SizeTier } from "./signals";

export const ACCOUNT_BUCKETS = ["UNDER_5K", "5K_TO_25K", "25K_TO_100K", "OVER_100K"] as const;
export type AccountBucket = (typeof ACCOUNT_BUCKETS)[number];

export const CASH_BUCKETS = ["UNDER_10", "10_TO_30", "OVER_30"] as const;
export type CashBucket = (typeof CASH_BUCKETS)[number];

/** Draft percentages from docs/sizing-guide.md. Each value is a share of the reader's total portfolio. */
const DRAFT: Record<AccountBucket, { starter: number; standard: number; full: number; cap: number }> = {
  UNDER_5K: { starter: 3, standard: 5, full: 7, cap: 10 },
  "5K_TO_25K": { starter: 2, standard: 4, full: 6, cap: 8 },
  "25K_TO_100K": { starter: 1.5, standard: 3, full: 5, cap: 7 },
  OVER_100K: { starter: 1, standard: 2.5, full: 4, cap: 5 },
};

export function sizingCap(account: AccountBucket): number {
  return DRAFT[account].cap;
}

/** Illustrative new allocation or add, in percentage points of total portfolio; adds still require room below the cap. */
export function sizingPercent(tier: SizeTier, account: AccountBucket, cash: CashBucket): number {
  const row = DRAFT[account];
  const base = tier === "STARTER" ? row.starter
    : tier === "STANDARD" ? row.standard
    : tier === "FULL" ? row.full
    : tier === "ADD_THIRD" ? row.full / 3
    : tier === "ADD_HALF" ? row.full / 2
    : 0;
  return Math.min(row.cap, base * (cash === "UNDER_10" ? 0.5 : 1));
}
