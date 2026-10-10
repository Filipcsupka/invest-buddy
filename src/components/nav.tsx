import Link from "next/link";
import { getMessages, localeCookie, otherLocale, type Locale } from "@/i18n";
import { LanguageSwitch, NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { latestScores } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { flags } from "@/config/flags";

export function BrandMark() {
  return (
    <svg className="brand-mark" width="28" height="16" viewBox="0 0 28 16" aria-hidden="true" focusable="false">
      <rect x="0.75" y="4.75" width="10.5" height="6.5" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.25" y="4.75" width="8.5" height="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23.75" y="4.75" width="3.5" height="6.5" className="brand-mark-signal" />
    </svg>
  );
}

export function Nav({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const target = otherLocale(locale);
  return (
    <header className="site-header">
      <div className="frame header-inner">
        <Link className="brand" href={`/${locale}`} aria-label={m.nav.home}>
          <BrandMark />
          <span className="brand-name">InvestBuddy</span>
        </Link>
        <NavLinks
          locale={locale}
          label={m.nav.label}
          items={[
            { href: "/dashboard", text: m.nav.dashboard },
            ...(ideasEnabled() && flags().ADVICE_OUTPUT ? [{ href: "/ideas", text: m.nav.ideas }] : []),
            { href: "/track-record", text: m.nav.trackRecord },
            ...(flags().INSIDERS_PAGE ? [{ href: "/insiders", text: m.nav.insiders }] : []),
            { href: "/portfolio", text: m.nav.portfolio },
            { href: "/methodology", text: m.nav.methodology },
            ...(flags().ADVICE_OUTPUT ? [{ href: "/sizing", text: m.nav.sizing }] : []),
          ]}
        />
        <div className="header-tools">
          <LanguageSwitch locale={locale} target={target} name={m.language.otherName} action={m.language.otherAction} cookie={localeCookie} />
          <ThemeToggle toDark={m.theme.toDark} toLight={m.theme.toLight} generic={m.theme.generic} />
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
        <nav aria-label={m.footer.legal} className="footer-links">
          <Link href={`/${locale}/methodology`}>{m.footer.methodology}</Link>
          <Link href={`/${locale}/legal/privacy`}>{m.footer.privacy}</Link>
          <Link href={`/${locale}/legal/terms`}>{m.footer.terms}</Link>
        </nav>
      </div>
    </footer>
  );
}
