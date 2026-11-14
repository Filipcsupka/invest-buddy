import { intlTag, type Locale } from "@/i18n";

/**
 * Plan prices in one place. VAT included, euro only. The copy files hold no digits; the figures live here and are formatted per
 * locale (Slovak decimal comma).
 *
 * - Active investor (the Plus plan): owner decision 2026-11-09, 9.90 EUR a month or 99 EUR a year (ten months, so two months free).
 * - Passive investor: owner request 2026-11-13, 5 EUR a month. The yearly 50 EUR follows the Plus pattern (ten months); OWNER TO CONFIRM.
 * - Market overview: the free account.
 */
export const PLAN_PRICES = {
  active: { monthlyEur: 9.9, yearlyEur: 99 },
  passive: { monthlyEur: 5, yearlyEur: 50 },
} as const;
export type PlanPrice = (typeof PLAN_PRICES)[keyof typeof PLAN_PRICES];

/** The Plus plan is the Active investor path. */
export const PLUS_PRICE = PLAN_PRICES.active;
export const PASSIVE_PRICE = PLAN_PRICES.passive;

export function formatEur(locale: Locale, value: number): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(intlTag[locale], { style: "currency", currency: "EUR", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

/** Yearly price spread over twelve months, for the "about ... a month" line. */
export const yearlyPerMonth = (price: PlanPrice = PLUS_PRICE) => Math.round((price.yearlyEur / 12) * 100) / 100;
