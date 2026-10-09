import { messages, type Messages, type Plural } from "./messages";

export type { Messages, Plural };
export const locales = ["en", "sk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeCookie = "NEXT_LOCALE";

/** BCP 47 tags used for Intl formatting and hreflang. */
export const intlTag: Record<Locale, string> = { en: "en-GB", sk: "sk-SK" };

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Operator disclosure text comes from OPERATOR_DISCLOSURE_EN / OPERATOR_DISCLOSURE_SK; unset or blank keeps the banner hidden. */
export function getMessages(locale: Locale): Messages {
  const base = messages[locale];
  const disclosure = process.env[`OPERATOR_DISCLOSURE_${locale.toUpperCase()}`]?.trim();
  return disclosure ? { ...base, common: { ...base.common, operatorDisclosure: disclosure } } : base;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "sk" : "en";
}

/** Replace `{name}` placeholders. Unknown placeholders are left in place so tests catch them. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export function plural(locale: Locale, forms: Plural, n: number): string {
  const rule = new Intl.PluralRules(intlTag[locale]).select(n);
  const form = rule === "one" || rule === "few" || rule === "many" ? forms[rule] : forms.other;
  return fill(form, { n: formatNumber(locale, n) });
}

export function formatNumber(locale: Locale, value: number, digits = 0): string {
  return new Intl.NumberFormat(intlTag[locale], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatPrice(locale: Locale, value: number | null): string {
  return value === null ? getMessages(locale).ruleDetails.unknown : formatNumber(locale, value, 2);
}

export function formatPercent(locale: Locale, ratio: number, digits = 1): string {
  return new Intl.NumberFormat(intlTag[locale], { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio);
}

export function formatCompact(locale: Locale, value: number): string {
  return new Intl.NumberFormat(intlTag[locale], { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

/** Dates in the engine are ISO `YYYY-MM-DD` session dates; format them in UTC so server and client agree. */
export function formatDate(locale: Locale, iso: string, style: "medium" | "short" = "medium"): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (style === "short") return new Intl.DateTimeFormat(intlTag[locale], { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat(intlTag[locale], { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** Path for the same page in another locale. `path` is the part after the locale, starting with `/` or empty. */
export function localePath(locale: Locale, path = ""): string {
  return `/${locale}${path}`;
}

/** Pick the best supported locale from an Accept-Language header. Czech readers get Slovak. */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter(({ tag, q }) => tag && Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "sk" || base === "cs") return "sk";
    if (base === "en") return "en";
  }
  return defaultLocale;
}
