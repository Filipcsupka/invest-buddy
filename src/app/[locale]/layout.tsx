import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { sideScript, themeScript } from "@/components/pre-paint";
import { getMessages, isLocale, locales } from "@/i18n";
import { Analytics } from "@/components/analytics";
import { JsonLd } from "@/components/json-ld";
import { siteJsonLd, siteNoindex, siteUrl } from "@/i18n/metadata";
import "../fonts.css";
import "../globals.css";
import "@/components/kit/kit.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d13" },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return {
    metadataBase: new URL(siteUrl),
    title: { default: m.meta.homeTitle, template: `%s · ${m.meta.siteName}` },
    description: m.meta.homeDescription,
    applicationName: m.meta.siteName,
    icons: { icon: "/favicon.svg" },
    ...(siteNoindex() ? { robots: { index: false, follow: false } } : {}),
  };
}

/** Thin root for both shells: document, theme pre-paint, skip link and analytics. */
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + sideScript }} />
      </head>
      <body>
        <JsonLd data={siteJsonLd(locale)} />
        <a className="skip-link" href="#main">
          {m.common.skipToContent}
        </a>
        {/* Each route group brings its shell: (marketing) a top bar, (app) the sidebar. Nothing here reads the request, so static pages stay static. */}
        {children}
        <Analytics />
      </body>
    </html>
  );
}
