import Link from "next/link";
import { getMessages, localeCookie, otherLocale, type Locale } from "@/i18n";
import { LanguageSwitch, MenuToggle, NavLinks, SideToggle } from "./nav-links";
import { IconArrowRight } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { latestScores } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { flags } from "@/config/flags";
import { getLegalMessages } from "@/i18n/legal-messages";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { getKitMessages } from "@/i18n/kit-messages";

export function BrandMark() {
  return (
    <svg className="brand-mark" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <rect className="brand-mark-tile" width="30" height="30" rx="8" />
      <rect className="brand-mark-bar" x="6.5" y="15" width="4.5" height="8.5" rx="1.5" />
      <rect className="brand-mark-bar" x="12.75" y="10.5" width="4.5" height="13" rx="1.5" />
      <rect className="brand-mark-signal" x="19" y="6" width="4.5" height="17.5" rx="1.5" />
    </svg>
  );
}

export function Nav({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const kit = getKitMessages(locale);
  const target = otherLocale(locale);
  return (
    <header className="site-header">
      <div className="side-top">
        <Link className="brand" href={`/${locale}`} aria-label={m.nav.home}>
          <BrandMark />
          <span className="brand-name nav-text-wide">InvestBuddy</span>
        </Link>
        <SideToggle collapseLabel={kit.shell.collapseSide} expandLabel={kit.shell.expandSide} />
        <MenuToggle openLabel={kit.shell.openMenu} closeLabel={kit.shell.closeMenu} />
      </div>
      <div className="side-panel" id="side-panel">
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", alignContent: "start", gap: "0.75rem" }}>
        <NavLinks
          locale={locale}
          label={m.nav.stocks}
          sectionLabel={m.nav.stocks}
          items={[
            { href: "/dashboard", text: m.nav.dashboard, icon: "dashboard" },
            { href: "/ai-screen", text: m.nav.aiScreen, icon: "scanner" },
            { href: "/scanner", text: m.nav.scanner, icon: "scanner" },
            { href: "/heatmap", text: getHeatmapMessages(locale).navLabel, icon: "heatmap" },
            ...(ideasEnabled() && flags().ADVICE_OUTPUT ? [{ href: "/ideas", text: m.nav.ideas, icon: "ideas" }] : []),
            { href: "/track-record", text: m.nav.trackRecord, icon: "track" },
            ...(flags().INSIDERS_PAGE ? [{ href: "/insiders", text: m.nav.insiders, icon: "insiders" }] : []),
            { href: "/portfolio", text: m.nav.portfolio, icon: "portfolio" },
            { href: "/methodology", text: m.nav.methodology, icon: "methodology" },
            ...(flags().ADVICE_OUTPUT ? [{ href: "/sizing", text: m.nav.sizing, icon: "sizing" }] : []),
            ...(flags().WAITLIST ? [{ href: "/pricing", text: getLaunchMessages(locale).pricing.title, icon: "pricing" }] : []),
          ]}
        />
        <NavLinks locale={locale} label={m.nav.etfs} sectionLabel={m.nav.etfs} items={[
          { href: "/etf", text: m.nav.etfResearch, icon: "scanner" },
          { href: "/etf/track-record", text: m.nav.etfTrackRecord, icon: "track" },
        ]} />
        </div>
        <div className="side-foot">
          {flags().WAITLIST && (
            <Link className="button cta side-cta" href={`/${locale}/pricing`}>
              <span className="nav-text">{getLaunchMessages(locale).landing.ctaWaitlist}</span>
              <IconArrowRight />
            </Link>
          )}
          <div className="header-tools">
            <LanguageSwitch locale={locale} target={target} name={m.language.otherName} action={m.language.otherAction} cookie={localeCookie} />
            <ThemeToggle toDark={m.theme.toDark} toLight={m.theme.toLight} generic={m.theme.generic} />
          </div>
        </div>
      </div>
    </header>
  );
}

export async function Footer({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const data = await latestScores();
  return (
    <footer className="site-footer">
      <div className="frame footer-inner">
        <p className="footer-note">
          <BrandMark />
          <span>{data.sample ? m.footer.note : m.footer.liveNote}</span>
          {data.sample && <span className="stamp">{m.common.sample}</span>}
        </p>
        <p className="footer-built">{getKitMessages(locale).shell.builtFor}</p>
        <nav aria-label={m.footer.legal} className="footer-links">
          <Link href={`/${locale}/methodology`}>{m.footer.methodology}</Link>
          <Link href={`/${locale}/legal/privacy`}>{m.footer.privacy}</Link>
          <Link href={`/${locale}/legal/terms`}>{m.footer.terms}</Link>
          <Link href={`/${locale}/legal/disclaimer`}>{m.footer.disclaimer}</Link>
        </nav>
        <p className="disclaimer footer-disclaimer">{getLegalMessages(locale).short}</p>
      </div>
    </footer>
  );
}
