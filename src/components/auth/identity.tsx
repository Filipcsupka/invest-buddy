"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n";
import { getIdentityMessages, trialLeftText, type IdentityMessages } from "@/i18n/identity-messages";
import { AuthDialogLink } from "./auth-dialog";
import { forgetIdentity, useIdentity, type Me } from "./identity-store";
import styles from "./identity.module.css";

export { useIdentity };

type Customer = Extract<Me, { kind: "customer" }>;

function planText(t: IdentityMessages, me: Customer, locale: Locale): string {
  if (me.plan !== "trial") return t.plan[me.plan];
  return `${t.plan.trial} · ${trialLeftText(t, me.trialDaysLeft ?? 0, locale)}`;
}

function PlanChip({ t, me, locale }: { t: IdentityMessages; me: Customer; locale: Locale }) {
  return <span className={styles.plan} data-plan={me.plan}>{planText(t, me, locale)}</span>;
}

/** Better Auth sign-out through the account route, for the owner and customers alike; it returns to /{locale}. */
function SignOut({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  return (
    <form method="post" action="/api/auth/account/sign-out" className={styles.signOutForm} onSubmit={forgetIdentity}>
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className={className ?? styles.signOut}>{label}</button>
    </form>
  );
}

/**
 * Sidebar footer: who is signed in and what they can do next. The space is reserved up front so nothing below moves when the state
 * arrives, and the state line is a polite live region.
 */
export function IdentityPanel({ locale, auth }: { locale: Locale; auth: boolean }) {
  const state = useIdentity();
  const path = usePathname() ?? `/${locale}`;
  const t = getIdentityMessages(locale);
  const me = state.status === "ready" ? state.me : null;
  const quiet = me?.kind === "anon" && !auth;
  return (
    <section className={styles.panel} data-state={me?.kind ?? "pending"} data-quiet={quiet ? "" : undefined} aria-label={t.region}>
      <p className={styles.status} aria-live="polite" aria-atomic="true">
        {!me && <><span className={styles.skeleton} aria-hidden="true" /><span className="visually-hidden">{t.loading}</span></>}
        {me?.kind === "anon" && !quiet && <span className={styles.stateText}>{t.anon}</span>}
        {me?.kind === "owner" && <><span className={styles.badge}>{t.owner}</span><span className={styles.stateText}>{t.ownerState}</span></>}
        {me?.kind === "customer" && <><PlanChip t={t} me={me} locale={locale} /><span className={styles.email} title={me.email}><span className="visually-hidden">{t.signedIn}: </span>{me.email}</span></>}
      </p>
      <div className={styles.actions}>
        {!me && <span className={styles.skeletonButton} aria-hidden="true" />}
        {me?.kind === "anon" && auth && <>
          <AuthDialogLink locale={locale} next={path} mode="sign-in" className={`button secondary ${styles.action}`}>{t.signIn}</AuthDialogLink>
          <AuthDialogLink locale={locale} next={path} mode="sign-up" className={`button ${styles.action}`}>{t.create}</AuthDialogLink>
        </>}
        {me?.kind === "owner" && <SignOut locale={locale} label={t.signOut} />}
        {me?.kind === "customer" && <>
          <Link className={styles.link} href={`/${locale}/account`}>{t.account}</Link>
          <SignOut locale={locale} label={t.signOut} />
        </>}
      </div>
      <Compact t={t} me={me} locale={locale} auth={auth} path={path} />
    </section>
  );
}

/** Icon rail: one short word, never only an icon. Hidden unless the rail is active. */
function Compact({ t, me, locale, auth, path }: { t: IdentityMessages; me: Me | null; locale: Locale; auth: boolean; path: string }) {
  if (!me) return <span className={`${styles.compact} ${styles.skeletonCompact}`} aria-hidden="true" />;
  if (me.kind === "owner") return <span className={`${styles.compact} ${styles.badge}`} title={t.ownerState}>{t.owner}</span>;
  if (me.kind === "customer") return <Link className={`${styles.compact} ${styles.plan}`} data-plan={me.plan} href={`/${locale}/account`} title={`${t.account}: ${me.email}`}>{t.plan[me.plan]}</Link>;
  if (!auth) return null;
  return <AuthDialogLink locale={locale} next={path} mode="sign-in" className={`${styles.compact} ${styles.link}`}>{t.signIn}</AuthDialogLink>;
}

/** Phone header: the state at a glance next to the menu button. Details and sign-out live in the drawer. */
export function IdentityChip({ locale, auth }: { locale: Locale; auth: boolean }) {
  const state = useIdentity();
  const path = usePathname() ?? `/${locale}`;
  const t = getIdentityMessages(locale);
  const me = state.status === "ready" ? state.me : null;
  let body: React.ReactNode = <span className={styles.skeletonChip} aria-hidden="true" />;
  if (me?.kind === "owner") body = <span className={styles.chipState} title={t.ownerState}><span className={styles.badge}>{t.owner}</span><span className={styles.chipText}>{t.signedIn}</span></span>;
  else if (me?.kind === "customer") body = <Link className={styles.chipState} href={`/${locale}/account`} title={me.email}><span className={styles.plan} data-plan={me.plan}>{t.plan[me.plan]}</span><span className={styles.chipText}>{t.account}</span></Link>;
  else if (me?.kind === "anon") body = auth ? <AuthDialogLink locale={locale} next={path} mode="sign-in" className={`button secondary ${styles.chipSignIn}`}>{t.signIn}</AuthDialogLink> : null;
  return <div className={styles.chip} aria-live="polite">{body}</div>;
}

/**
 * Marketing top bar: Sign in and Create free account for visitors, the signed-in state and "Open app" for everyone else. The static
 * HTML carries the visitor buttons and depends on no flag; with AUTH off the sign-in screen itself says sign-in opens soon.
 */
export function TopBarIdentity({ locale }: { locale: Locale }) {
  const state = useIdentity();
  const path = usePathname() ?? `/${locale}`;
  const t = getIdentityMessages(locale);
  const me = state.status === "ready" ? state.me : state.status === "server" ? { kind: "anon" as const, markets: false as const } : null;
  const openApp = <Link className={`button cta ${styles.topAction}`} href={`/${locale}/dashboard`}>{t.openApp}</Link>;
  let body: React.ReactNode = <span className={styles.skeletonTop} aria-hidden="true" />;
  if (me?.kind === "owner") body = <><span className={styles.topState} title={t.ownerState}><span className={styles.badge}>{t.owner}</span><span className={styles.topText}>{t.signedIn}</span></span>{openApp}</>;
  else if (me?.kind === "customer") body = <><span className={styles.topState}><span className={styles.plan} data-plan={me.plan}>{planText(t, me, locale)}</span><span className={`${styles.topText} ${styles.topEmail}`} title={me.email}><span className="visually-hidden">{t.signedIn}: </span>{me.email}</span></span>{openApp}</>;
  else if (me?.kind === "anon") body = <>
    <AuthDialogLink locale={locale} next={path} mode="sign-in" className={styles.topLink}>{t.signIn}</AuthDialogLink>
    <AuthDialogLink locale={locale} next={path} mode="sign-up" className={`button cta ${styles.topAction}`}>{t.create}</AuthDialogLink>
  </>;
  return <div className={styles.top} aria-live="polite">{body}</div>;
}
