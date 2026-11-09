"use client";
import { useEffect, useRef, useState } from "react";
import { AuthDialogLink } from "@/components/auth/auth-dialog";
import type { Locale } from "@/i18n";
import styles from "./welcome.module.css";

/**
 * Phone-only bar with the one call to action, shown once the hero has scrolled out and hidden again near the closing form. It is
 * position: fixed and slides with transform, so it never moves layout. Without JavaScript it stays hidden; the hero and the close
 * section carry the same action.
 */
export function StickyCta({ locale, label }: { locale: Locale; label: string }) {
  const [shown, setShown] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hero = document.querySelector('[data-w="hero"]');
    const close = document.getElementById("join");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const seen = { hero: true, close: false };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) seen.hero = entry.isIntersecting;
        if (entry.target === close) seen.close = entry.isIntersecting;
      }
      setShown(!seen.hero && !seen.close);
    });
    observer.observe(hero);
    if (close) observer.observe(close);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={bar} className={styles.sticky} data-shown={shown ? "" : undefined} inert={!shown}>
      <AuthDialogLink locale={locale} next={`/${locale}`} className={`button cta ${styles.stickyButton}`}>{label}</AuthDialogLink>
    </div>
  );
}
