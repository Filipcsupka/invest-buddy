import type { Metadata } from "next";
import { getMessages, intlTag, locales, type Locale } from "./index";

export const siteUrl = process.env.SITE_URL ?? "https://invest.filipcsupka.online";

/** Title, description, canonical and hreflang alternates for one page in one locale. `path` excludes the locale. */
export function pageMetadata(locale: Locale, path: string, title: string | null, description: string): Metadata {
  const m = getMessages(locale);
  const languages = Object.fromEntries(locales.map((l) => [intlTag[l], `/${l}${path}`]));
  return {
    title: title ?? { absolute: m.meta.homeTitle },
    description,
    alternates: { canonical: `/${locale}${path}`, languages: { ...languages, "x-default": `/en${path}` } },
    openGraph: { title: title ?? m.meta.homeTitle, description, siteName: m.meta.siteName, locale: intlTag[locale].replace("-", "_"), type: "website", url: `/${locale}${path}`, images: [{ url: "/og", width: 1200, height: 630, alt: m.meta.siteName }] },
    twitter: { card: "summary_large_image", title: title ?? m.meta.homeTitle, description, images: ["/og"] },
  };
}
