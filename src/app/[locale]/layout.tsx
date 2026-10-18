import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Footer, Nav } from "@/components/nav";
import { sideScript, themeScript } from "@/components/pre-paint";
import { getMessages, isLocale, locales } from "@/i18n";
import { Analytics } from "@/components/analytics";
import { JsonLd } from "@/components/json-ld";
import { siteJsonLd, siteNoindex, siteUrl } from "@/i18n/metadata";
import { TierBanner } from "@/components/kit/tier";
import { getKitMessages } from "@/i18n/kit-messages";
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

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const kit = getKitMessages(locale);
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
        <div className="app-shell">
          <Nav locale={locale} />
          <div className="app-body">
            {/* Tier logic is a later work package; until it decides a mode, the banner stays hidden for everyone. */}
            <TierBanner mode="hidden" title={kit.banner.admin} note={kit.banner.adminNote} badgeLabel={kit.tier.paid} />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <Footer locale={locale} />
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
