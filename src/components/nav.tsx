import Link from "next/link";
import { getMessages, localeCookie, otherLocale, type Locale } from "@/i18n";
import { LanguageSwitch, MenuToggle, NavLater, NavLinks, SideToggle } from "./nav-links";
import { IconArrowRight } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { latestScores } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { flags } from "@/config/flags";
import { getLegalMessages } from "@/i18n/legal-messages";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { getNavSectionsMessages } from "@/i18n/nav-sections-messages";
import { getKitMessages } from "@/i18n/kit-messages";
import { IdentityChip, IdentityPanel } from "./auth/identity";
import { getIdentityMessages } from "@/i18n/identity-messages";
import { PRIVATE_DATA_SECTIONS } from "@/app/private-data-routes";
import type { NavItem } from "./nav-links";

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

const privateSections = new Set<string>(PRIVATE_DATA_SECTIONS);

/**
 * The app shell sidebar. It reads no request data, so the shared HTML is the same for everyone. Entries a customer can really use are
 * rendered for all viewers; vendor-derived pages (while EODHD_PRIVATE_USE=on) render locked until /api/me says who is signed in.
 * Market and ETF links use the same Plus preview pattern. Server gates in the proxy stay the authority.
 * Docs: docs/app-panel-audit.md.
 */
export function Nav({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const kit = getKitMessages(locale);
  const target = otherLocale(locale);
  const f = flags();
  const id = getIdentityMessages(locale);
  const lock = { open: id.open, free: id.plan.free, plus: id.plus, locked: id.locked, owner: m.nav.ownerOnly };
  const vendorLocked = process.env.EODHD_PRIVATE_USE === "on";
  const vendor = (items: NavItem[]): NavItem[] => items.map((item) => {
    const locked = Boolean(item.locked || (vendorLocked && privateSections.has(item.href.slice(1).split("/")[0])));
    return { ...item, locked, tier: locked ? "plus" : item.tier ?? "free" };
  });
  const sections = getNavSectionsMessages(locale);
  const marketItems: NavItem[] = [
    { href: "/economy", text: m.nav.economy, icon: "economy", locked: true },
    { href: "/calendar", text: sections.calendar, icon: "economy", locked: true },
    { href: "/news", text: m.nav.news, icon: "news", locked: true },
    { href: "/congress", text: m.nav.congress, icon: "congress", locked: true },
    ...(f.INSIDERS_PAGE ? [{ href: "/insiders", text: m.nav.insiders, icon: "insiders", locked: true }] : []),
    { href: "/screener", text: m.nav.screener, icon: "scanner", locked: true },
  ];
  const etfItems: NavItem[] = [
    { href: "/etf", text: m.nav.etfResearch, icon: "scanner", locked: true },
    { href: "/etf/track-record", text: m.nav.etfTrackRecord, icon: "track", locked: true },
  ];
  return (
    <header className="site-header">
      <div className="side-top">
        <Link className="brand" href={`/${locale}`} aria-label={m.nav.home}>
          <BrandMark />
          <span className="brand-name nav-text-wide">InvestBuddy</span>
        </Link>
        <SideToggle collapseLabel={kit.shell.collapseSide} expandLabel={kit.shell.expandSide} />
        <IdentityChip locale={locale} auth={f.AUTH} />
        <MenuToggle openLabel={kit.shell.openMenu} closeLabel={kit.shell.closeMenu} />
      </div>
      <div className="side-panel" id="side-panel">
        <div className="side-scroll">
          <NavLinks locale={locale} label={m.nav.dashboard} lock={lock} items={vendor([
            { href: "/dashboard", text: m.nav.dashboard, icon: "dashboard" },
          ])} />
          <NavLinks locale={locale} label={m.nav.stocks} sectionLabel={m.nav.stocks} lock={lock} items={vendor([
            { href: "/stocks", text: m.nav.stocks, icon: "scanner" },
            { href: "/heatmap", text: getHeatmapMessages(locale).navLabel, icon: "heatmap" },
            { href: "/track-record", text: m.nav.trackRecord, icon: "track" },
            { href: "/portfolio", text: m.nav.portfolio, icon: "portfolio" },
            ...(f.INSIDERS_PAGE && !f.MARKETS_VIEWS ? [{ href: "/insiders", text: m.nav.insiders, icon: "insiders" }] : []),
            ...(ideasEnabled() && f.ADVICE_OUTPUT ? [{ href: "/ideas", text: m.nav.ideas, icon: "ideas", locked: true as const }] : []),
            ...(f.ADVICE_OUTPUT ? [{ href: "/sizing", text: m.nav.sizing, icon: "sizing" }] : []),
          ])} />
          <NavLinks locale={locale} label={m.nav.etfs} sectionLabel={m.nav.etfs} lock={lock} items={etfItems.map((item) => ({ ...item, tier: "plus" }))} />
          {f.MARKETS_VIEWS && <NavLinks locale={locale} label={m.nav.indices} sectionLabel={m.nav.indices} lock={lock} items={[{ href: "/indices", text: m.nav.indices, icon: "indices", locked: true, tier: "plus" }]} />}
          {f.MARKETS_VIEWS && <NavLinks locale={locale} label={sections.marketsCalendar} sectionLabel={sections.marketsCalendar} lock={lock} separator items={marketItems.map((item) => ({ ...item, tier: "plus" }))} />}
          <NavLinks locale={locale} label={m.nav.learn} sectionLabel={m.nav.learn} lock={lock} items={[
            { href: "/methodology", text: m.nav.methodology, icon: "methodology", tier: "open" },
            { href: "/pricing", text: getLaunchMessages(locale).pricing.title, icon: "pricing", tier: "open" },
          ]} />
          <NavLater label={m.nav.comingLater} items={[{ icon: "portfolio", text: sections.myPortfolioSoon }]} />
        </div>
        <div className="side-foot">
          <IdentityPanel locale={locale} auth={f.AUTH} />
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

/**
 * Site footer. `data` reads the latest scores for the sample or live note; static marketing pages pass false, so their HTML never
 * holds data read at build time.
 */
export async function Footer({ locale, data: withData = true }: { locale: Locale; data?: boolean }) {
  const m = getMessages(locale);
  const data = withData ? await latestScores() : null;
  return (
    <footer className="site-footer">
      <div className="frame footer-inner">
        <p className="footer-note">
          <BrandMark />
          {data ? <span>{data.sample ? m.footer.note : m.footer.liveNote}</span> : <span>InvestBuddy</span>}
          {data?.sample && <span className="stamp">{m.common.sample}</span>}
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
