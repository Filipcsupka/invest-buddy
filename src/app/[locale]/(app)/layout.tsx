import { notFound } from "next/navigation";
import { Footer, Nav } from "@/components/nav";
import { TierBanner } from "@/components/kit/tier";
import { isLocale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";

/**
 * The app shell with the left sidebar. It reads no request headers: who is signed in, and which items are locked for them, come from the
 * nav islands (/api/me). Server gates in the proxy and on each page stay the authority.
 */
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const kit = getKitMessages(locale);
  return (
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
  );
}
