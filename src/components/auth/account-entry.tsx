"use client";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { hasSessionHint } from "@/auth/client-api";
import { isLocale, type Locale } from "@/i18n";
import { getAuthMessages } from "@/i18n/auth-messages";
import { AuthDialogLink } from "./auth-dialog";
import styles from "./auth.module.css";

const noop = () => () => {};

/**
 * Sign in and Create account entries for the header or sidebar. Takes no props so the nav can place it without wiring: the locale comes
 * from the path. The server HTML is the same for every visitor; once the session hint cookie is seen, the entry hides itself (the account
 * menu is a later work package).
 */
export function AccountEntry() {
  const path = usePathname() ?? "/en";
  const first = path.split("/")[1] ?? "";
  const locale: Locale = isLocale(first) ? first : "en";
  const t = getAuthMessages(locale).account;
  const signedIn = useSyncExternalStore(noop, () => hasSessionHint(), () => false);
  if (signedIn) return null;
  return (
    <div className={styles.entry}>
      <AuthDialogLink locale={locale} next={path} mode="sign-in" className={styles.entrySignIn}>{t.signIn}</AuthDialogLink>
      <AuthDialogLink locale={locale} next={path} className={`button ${styles.entryCreate}`}>{t.create}</AuthDialogLink>
    </div>
  );
}
