import { formatCompact, formatDate, formatNumber, type Locale } from "@/i18n";
import type { AssetClass } from "@/db/asset-bars";
import { getMarketsMessages } from "@/i18n/markets-messages";

/** Digits for a price level: indices use two decimal places. */
export function priceDigits(assetClass: AssetClass, value: number): number {
  if (assetClass === "fx") return value >= 20 ? 3 : 5;
  return 2;
}
const none = (locale: Locale) => getMarketsMessages(locale).noValue;
export const level = (locale: Locale, assetClass: AssetClass, value: number | null): string => value === null ? none(locale) : formatNumber(locale, value, priceDigits(assetClass, value));
/** A ratio (0.012) as a signed percent ("+1.20 %"). */
export const signedRatio = (locale: Locale, ratio: number | null): string => ratio === null ? none(locale) : `${ratio > 0 ? "+" : ratio < 0 ? "−" : ""}${formatNumber(locale, Math.abs(ratio) * 100, 2)} %`;
/** A vendor percent value (0.52 meaning 0.52 %) as a signed percent. */
export const signedPercent = (locale: Locale, percent: number | null): string => percent === null ? none(locale) : signedRatio(locale, percent / 100);
export const percentOf = (locale: Locale, ratio: number | null, digits = 2): string => ratio === null ? none(locale) : `${formatNumber(locale, ratio * 100, digits)} %`;
export const compact = (locale: Locale, value: number | null): string => value === null ? none(locale) : formatCompact(locale, value);
export const day = (locale: Locale, iso: string | null): string => iso ? formatDate(locale, iso) : none(locale);
