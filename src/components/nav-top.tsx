import Link from "next/link";
import { getMessages, localeCookie, otherLocale, type Locale } from "@/i18n";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { getIdentityMessages } from "@/i18n/identity-messages";
import { BrandMark } from "./nav";
import { LanguageSwitch } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { TopBarIdentity } from "./auth/identity";
import styles from "./nav-top.module.css";

/**
 * Presentation shell header for Welcome, pricing, sign-in, reset, methodology and legal pages. No sidebar and no links into gated app
 * pages, so nothing here prefetches a private route. It reads no feature flag, so the static HTML does not depend on the build env. The
 * signed-in state comes from the identity island.
 */
export function TopBar({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getIdentityMessages(locale);
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link className={`brand ${styles.brand}`} href={`/${locale}`} aria-label={m.nav.home}>
          <BrandMark />
          <span className="brand-name">InvestBuddy</span>
        </Link>
        <nav aria-label={t.siteNav} className={styles.links}>
          <Link href={`/${locale}/methodology`}>{m.nav.methodology}</Link>
          <Link href={`/${locale}/pricing`}>{getLaunchMessages(locale).pricing.title}</Link>
        </nav>
        <div className={styles.end}>
          <TopBarIdentity locale={locale} />
          <div className={styles.tools}>
            <LanguageSwitch locale={locale} target={otherLocale(locale)} name={m.language.otherName} action={m.language.otherAction} cookie={localeCookie} />
            <ThemeToggle toDark={m.theme.toDark} toLight={m.theme.toLight} generic={m.theme.generic} />
          </div>
        </div>
      </div>
    </header>
  );
}
