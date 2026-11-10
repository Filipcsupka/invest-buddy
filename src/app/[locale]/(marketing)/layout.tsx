import { notFound } from "next/navigation";
import { Footer } from "@/components/nav";
import { TopBar } from "@/components/nav-top";
import { isLocale } from "@/i18n";

/** The presentation shell: a slim top bar, no sidebar. It reads nothing from the request, so these pages stay static and cacheable. */
export default async function MarketingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="site-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", overflowX: "clip" }}>
      <TopBar locale={locale} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer locale={locale} data={false} />
    </div>
  );
}
