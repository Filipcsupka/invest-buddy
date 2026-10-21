import type { EtfCall, VerificationStatus } from "@/db/etf";
import { formatDate, formatNumber, type Locale } from "@/i18n";
import { getEtfMessages } from "@/i18n/etf-messages";
import s from "./etf.module.css";

export const amount = (locale: Locale, value: number | null, digits = 1): string => value === null ? getEtfMessages(locale).noValue : formatNumber(locale, value, digits);
export const percent = (locale: Locale, value: number | null): string => value === null ? getEtfMessages(locale).noValue : `${formatNumber(locale, value, 2)} %`;
export const signedPercent = (locale: Locale, value: number | null): string => value === null ? getEtfMessages(locale).noValue : `${value > 0 ? "+" : ""}${formatNumber(locale, value, 2)} %`;
export const displayedDate = (locale: Locale, value: string | null): string => value ? formatDate(locale, value) : getEtfMessages(locale).noValue;
export function CallBadge({ call, locale }: { call: EtfCall; locale: Locale }) {
  const tone = call === "BUY_ZONE" ? s.buy : call === "WATCH" ? s.watch : s.avoid;
  return <span className={`${s.badge} ${tone}`}>{getEtfMessages(locale)[call]}</span>;
}
export function VerificationBadge({ status, locale }: { status: VerificationStatus; locale: Locale }) {
  const tone = status === "verified" ? s.verified : status === "partial" ? s.partial : s.unverified;
  return <span className={`${s.badge} ${tone}`}>{getEtfMessages(locale)[status]}</span>;
}
