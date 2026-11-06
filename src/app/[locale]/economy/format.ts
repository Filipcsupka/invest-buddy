import { fill, formatNumber, intlTag, type Locale } from "@/i18n";

/** Day, month and time in UTC, so server and client agree, for example "20 Nov, 18:00". */
export function formatUtcTime(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(intlTag[locale], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(iso));
}

/** Signed change in basis points between two percentages, or null when either is missing. */
export function basisPoints(locale: Locale, template: string, now: number | null | undefined, before: number | null | undefined): string | null {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  const bp = Math.round((now - before) * 100);
  return fill(template, { n: `${bp > 0 ? "+" : bp < 0 ? "−" : ""}${formatNumber(locale, Math.abs(bp))}` });
}

/** A vendor figure with up to two decimals, or the dash. */
export function figure(locale: Locale, value: number | null | undefined, dash: string, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return dash;
  return formatNumber(locale, value, Number.isInteger(value) && Math.abs(value) >= 100 ? 0 : digits);
}
