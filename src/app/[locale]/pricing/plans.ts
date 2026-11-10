import { intlTag, type Locale } from "@/i18n";

/**
 * Plus prices, owner decision 2026-11-09: 9.90 EUR a month, or 99 EUR a year (ten months, so two months free). VAT included, euro only.
 * The copy files hold no digits; the figures live here and are formatted per locale (Slovak decimal comma).
 */
export const PLUS_PRICE = { monthlyEur: 9.9, yearlyEur: 99 } as const;

export function formatEur(locale: Locale, value: number): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(intlTag[locale], { style: "currency", currency: "EUR", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

/** Yearly price spread over twelve months, for the "about ... a month" line. */
export const yearlyPerMonth = () => Math.round((PLUS_PRICE.yearlyEur / 12) * 100) / 100;
