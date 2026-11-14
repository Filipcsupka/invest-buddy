import type { EtfCall, VerificationStatus } from "@/db/etf";
import { formatDate, formatNumber, type Locale } from "@/i18n";
import { getEtfMessages } from "@/i18n/etf-messages";
import s from "./etf.module.css";

export const amount = (locale: Locale, value: number | null, digits = 1): string => value === null ? getEtfMessages(locale).noValue : formatNumber(locale, value, digits);
export const percent = (locale: Locale, value: number | null, digits = 2): string => value === null ? getEtfMessages(locale).noValue : `${formatNumber(locale, value, digits)} %`;
export const signedPercent = (locale: Locale, value: number | null, digits = 2): string => value === null ? getEtfMessages(locale).noValue : `${value > 0 ? "+" : ""}${formatNumber(locale, value, digits)} %`;
export const displayedDate = (locale: Locale, value: string | null): string => value ? formatDate(locale, value) : getEtfMessages(locale).noValue;
/** Millions with fewer digits as the figure grows: 12.3, 456, 7,890. */
export const millions = (locale: Locale, value: number | null): string => value === null ? getEtfMessages(locale).noValue : formatNumber(locale, value, Math.abs(value) >= 100 ? 0 : 1);

/** A table gap: a dash on screen and the spoken reason for assistive technology. */
export function Gap({ locale, reason }: { locale: Locale; reason?: string }) {
  const label = reason ?? getEtfMessages(locale).noValue;
  return <span className={s.gap} title={label}><span aria-hidden="true">–</span><span className="visually-hidden">{label}</span></span>;
}
/** A number cell value, or a gap when the stored value is missing. */
export function Figure({ locale, value, format, reason }: { locale: Locale; value: number | null | undefined; format: (locale: Locale, value: number) => string; reason?: string }) {
  return value === null || value === undefined || !Number.isFinite(value) ? <Gap locale={locale} reason={reason} /> : <>{format(locale, value)}</>;
}
export function CallBadge({ call, locale }: { call: EtfCall; locale: Locale }) {
  const tone = call === "BUY_ZONE" ? s.buy : call === "WATCH" ? s.watch : s.avoid;
  return <span className={`${s.badge} ${tone}`}>{getEtfMessages(locale)[call]}</span>;
}
export function VerificationBadge({ status, locale }: { status: VerificationStatus; locale: Locale }) {
  const tone = status === "verified" ? s.verified : status === "partial" ? s.partial : s.unverified;
  return <span className={`${s.badge} ${tone}`}>{getEtfMessages(locale)[status]}</span>;
}
