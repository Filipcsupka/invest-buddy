// Single source for plan prices and limits. Every value here is PLANNED and
// not confirmed by the owner (decision 19 in docs/roadmap/README.md). The
// pricing page and the landing summary read this file and show the numbers as
// planned. W42 reads it later for checkout.

export type PriceVariantId = "a" | "b";

interface PlannedPrice {
  /** Price per month, VAT included, billed yearly. Placeholder. */
  monthlyEur: number;
}

/** Two prices for the waitlist test (130 section 9, step 4). Placeholders. */
export const PRICE_VARIANTS: Record<PriceVariantId, PlannedPrice> = {
  a: { monthlyEur: 9.9 },
  b: { monthlyEur: 14 },
};

export const DEFAULT_PRICE_VARIANT: PriceVariantId = "a";

/** Free-tier limits. The N values are placeholders until the owner sets them. */
export const FREE_LIMITS = {
  scoreHistoryDays: 30,
  scannerRows: 10,
} as const;

function isPriceVariant(value: unknown): value is PriceVariantId {
  return value === "a" || value === "b";
}

/** Reads the `v` query value. Anything unknown falls back to the default variant. */
export function resolveVariant(value: string | string[] | undefined): PriceVariantId {
  const first = Array.isArray(value) ? value[0] : value;
  return isPriceVariant(first) ? first : DEFAULT_PRICE_VARIANT;
}

/** Yearly total, rounded to cents. */
export function yearlyTotalEur(variant: PriceVariantId): number {
  return Math.round(PRICE_VARIANTS[variant].monthlyEur * 12 * 100) / 100;
}
