import type { Metadata } from "next";
import { getMessages, intlTag, locales, type Locale } from "./index";

export const siteUrl = process.env.SITE_URL ?? "https://invest.filipcsupka.online";

const MAX_DESCRIPTION = 160;

/** Search snippets cut near 160 characters, so long page text is shortened at a word boundary. */
export function snippet(text: string, max = MAX_DESCRIPTION): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2)).replace(/[\s,;:.-]+$/, "")}…`;
}

/** Staging and preview deployments set SITE_NOINDEX so crawlers skip the whole site. */
export const siteNoindex = () => ["1", "true", "on"].includes((process.env.SITE_NOINDEX ?? "").toLowerCase());

/** Title, description, canonical and hreflang alternates for one page in one locale. `path` excludes the locale. */
export function pageMetadata(locale: Locale, path: string, title: string | null, description: string): Metadata {
  const m = getMessages(locale);
  description = snippet(description);
  const languages = Object.fromEntries(locales.map((l) => [intlTag[l], `/${l}${path}`]));
  return {
    title: title ?? { absolute: m.meta.homeTitle },
    description,
    alternates: { canonical: `/${locale}${path}`, languages: { ...languages, "x-default": `/en${path}` } },
    openGraph: { title: title ?? m.meta.homeTitle, description, siteName: m.meta.siteName, locale: intlTag[locale].replace("-", "_"), alternateLocale: locales.filter((l) => l !== locale).map((l) => intlTag[l].replace("-", "_")), type: "website", url: `/${locale}${path}`, images: [{ url: "/og", width: 1200, height: 630, alt: m.meta.siteName }] },
    twitter: { card: "summary_large_image", title: title ?? m.meta.homeTitle, description, images: ["/og"] },
    ...(siteNoindex() ? { robots: { index: false, follow: false } } : {}),
  };
}

const abs = (path: string) => `${siteUrl}${path}`;

/** Site-wide structured data: who runs the site and what it is. No ratings, no offers. */
export function siteJsonLd(locale: Locale): object[] {
  const m = getMessages(locale);
  return [
    { "@context": "https://schema.org", "@type": "Organization", "@id": abs("/#organization"), name: m.meta.siteName, url: abs(`/${locale}`), logo: abs("/favicon.svg") },
    { "@context": "https://schema.org", "@type": "WebSite", "@id": abs("/#website"), name: m.meta.siteName, url: abs(`/${locale}`), description: m.meta.homeDescription, inLanguage: intlTag[locale], publisher: { "@id": abs("/#organization") } },
  ];
}

/** Company page structured data: a neutral page, its dataset of recorded rule results and the breadcrumb. No rating, review, offer or product markup. */
export function companyJsonLd(locale: Locale, ticker: string, name: string, dateModified: string | null, description: string): object[] {
  const m = getMessages(locale);
  const path = `/${locale}/company/${ticker}`;
  const label = name === ticker ? ticker : `${ticker}, ${name}`;
  const modified = dateModified ? { dateModified } : {};
  return [
    { "@context": "https://schema.org", "@type": "WebPage", "@id": abs(path), url: abs(path), name: label, description: snippet(description), inLanguage: intlTag[locale], isPartOf: { "@id": abs("/#website") }, ...modified },
    { "@context": "https://schema.org", "@type": "Dataset", name: label, description: snippet(description), url: abs(path), inLanguage: intlTag[locale], isAccessibleForFree: true, creator: { "@id": abs("/#organization") }, ...modified },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: m.meta.siteName, item: abs(`/${locale}`) },
      { "@type": "ListItem", position: 2, name: m.nav.dashboard, item: abs(`/${locale}/dashboard`) },
      { "@type": "ListItem", position: 3, name: ticker, item: abs(path) },
    ] },
  ];
}
