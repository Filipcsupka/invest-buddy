"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { safeNext } from "@/auth/client-api";
import type { AuthMode } from "./auth-form";
import { getAuthMessages } from "@/i18n/auth-messages";
import type { Locale } from "@/i18n";
import { MODAL_EVENT } from "./events";
import styles from "./auth.module.css";

// The form loads only when a dialog opens, so pages that merely show the trigger do not ship it.
const AuthForm = dynamic(() => import("./auth-form").then((m) => m.AuthForm), { ssr: false, loading: () => <div className={styles.formPlaceholder} aria-hidden="true" /> });


interface Props {
  locale: Locale;
  /** Path to land on after sign-in. Defaults to the page the visitor is on. */
  next?: string;
  /** Which tab the form opens on. */
  mode?: AuthMode;
  className?: string;
  children: ReactNode;
}

/**
 * A link to the sign-in page that opens the same form in a native `<dialog>` when JavaScript runs. The dialog gives focus trapping and
 * Escape for free; focus returns to the trigger on close. Without JavaScript the link simply navigates.
 */
export function AuthDialogLink({ locale, next, mode = "sign-up", className, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(next ?? `/${locale}`);
  const t = getAuthMessages(locale);
  const href = `/${locale}/sign-in?next=${encodeURIComponent(next ?? `/${locale}`)}${mode === "sign-in" ? "&mode=sign-in" : ""}`;

  const close = useCallback(() => dialog.current?.close(), []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClose = () => {
      setOpen(false);
      window.dispatchEvent(new CustomEvent(MODAL_EVENT, { detail: false }));
      trigger.current?.focus();
    };
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const el = dialog.current;
    if (!el || typeof el.showModal !== "function" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setTarget(safeNext(next ?? `${window.location.pathname}${window.location.search}`, `/${locale}`));
    setOpen(true);
    el.showModal();
    window.dispatchEvent(new CustomEvent(MODAL_EVENT, { detail: true }));
  }

  return (
    <>
      <a ref={trigger} href={href} className={className} onClick={onClick}>{children}</a>
      <dialog ref={dialog} className={styles.dialog} aria-label={t.title} data-lenis-prevent="" onClick={(event) => { if (event.target === dialog.current) close(); }}>
        <div className={styles.dialogBody}>
          <button type="button" className={styles.dialogClose} onClick={close} aria-label={t.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          {open ? <AuthForm locale={locale} next={target} mode={mode} headingLevel={2} /> : null}
        </div>
      </dialog>
    </>
  );
}
