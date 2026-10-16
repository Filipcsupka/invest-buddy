import type { Metadata, Viewport } from "next";
import { Archivo, Source_Serif_4 } from "next/font/google";
import { notFound } from "next/navigation";
import { Footer, Nav } from "@/components/nav";
import { themeScript } from "@/components/theme-toggle";
import { getMessages, isLocale, locales } from "@/i18n";
import { Analytics } from "@/components/analytics";
import { JsonLd } from "@/components/json-ld";
import { siteJsonLd, siteNoindex, siteUrl } from "@/i18n/metadata";
import { TierBanner } from "@/components/kit/tier";
import { getKitMessages } from "@/i18n/kit-messages";
import "../globals.css";
import "@/components/kit/kit.css";

const sans = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin", "latin-ext"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceeeb" },
    { media: "(prefers-color-scheme: dark)", color: "#111416" },
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
    <html lang={locale} className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <JsonLd data={siteJsonLd(locale)} />
        <a className="skip-link" href="#main">
          {m.common.skipToContent}
        </a>
        <Nav locale={locale} />
        {/* Tier logic is a later work package; until it decides a mode, the banner stays hidden for everyone. */}
        <TierBanner mode="hidden" title={kit.banner.admin} note={kit.banner.adminNote} badgeLabel={kit.tier.paid} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer locale={locale} />
        <Analytics />
      </body>
    </html>
  );
}
