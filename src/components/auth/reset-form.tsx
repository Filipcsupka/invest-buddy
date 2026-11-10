"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { passwordOk, resetWithRecoveryCode, validEmail, PASSWORD_MIN, type Failure } from "@/auth/client-api";
import { fill, type Locale } from "@/i18n";
import { getAuthMessages } from "@/i18n/auth-messages";
import { noticeFor, type AuthState } from "./auth-form";
import { PasswordField } from "./password-field";
import styles from "./auth.module.css";

export type ResetState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; remaining: number | null }
  | { kind: "bad-code" }
  | { kind: "invalid-email" }
  | { kind: "weak-password" }
  | { kind: "missing-code" }
  | Exclude<Failure, { kind: "invalid-email" } | { kind: "weak-password" } | { kind: "error"; status: number }>
  | { kind: "error" };

/** Email, one recovery code and a new password. The only way back in without email: the copy says so. */
export function ResetForm({ locale, deps }: { locale: Locale; deps?: { fetcher?: typeof fetch } }) {
  const t = getAuthMessages(locale);
  const r = t.reset;
  const id = useId();
  const [state, setState] = useState<ResetState>({ kind: "idle" });
  const [left, setLeft] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = state.kind === "sending";

  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  useEffect(() => {
    if (["done", "bad-code", "rate-limited", "network", "unavailable", "error"].includes(state.kind)) statusRef.current?.focus();
  }, [state.kind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const code = String(data.get("code") ?? "");
    const newPassword = String(data.get("password") ?? "");
    if (!validEmail(email)) { setState({ kind: "invalid-email" }); emailRef.current?.focus(); return; }
    if (!code.trim()) { setState({ kind: "missing-code" }); codeRef.current?.focus(); return; }
    if (!passwordOk(newPassword)) { setState({ kind: "weak-password" }); passwordRef.current?.focus(); return; }
    setState({ kind: "sending" });
    const outcome = await resetWithRecoveryCode({ email, code, newPassword }, deps?.fetcher);
    if (outcome.kind === "reset") return setState({ kind: "done", remaining: outcome.remaining });
    if (outcome.kind === "rate-limited" && outcome.retryAfter) setLeft(outcome.retryAfter);
    if (outcome.kind === "bad-code") codeRef.current?.select();
    setState(outcome.kind === "error" ? { kind: "error" } : outcome);
  }

  if (state.kind === "done") {
    return (
      <div className={styles.form} data-state="done">
        <div className={styles.sent} role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>
          <h1 className={styles.title}>{r.doneTitle}</h1>
          <p>{r.doneBody}</p>
          {state.remaining !== null ? <p className="num">{fill(r.doneRemaining, { n: state.remaining })}</p> : null}
          <Link className={`button ${styles.submit}`} href={`/${locale}/sign-in?mode=sign-in`}>{r.signIn}</Link>
        </div>
      </div>
    );
  }

  const shared: AuthState | null = state.kind === "rate-limited" || state.kind === "network" || state.kind === "unavailable" || state.kind === "error" ? (state as AuthState) : null;
  const notice = state.kind === "bad-code" ? { tone: "error" as const, title: r.badCodeTitle, body: r.badCodeBody } : shared ? noticeFor(shared, t, left) : null;
  const codeError = state.kind === "missing-code" ? r.codeHint : null;
  return (
    <div className={styles.form} data-state={state.kind} aria-busy={busy || undefined}>
      <header className={styles.head}>
        <h1 className={styles.title}>{r.title}</h1>
        <p className={styles.lede}>{r.lede}</p>
      </header>
      <div className={styles.status} role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>
        {notice ? (
          <div className={styles.notice} data-tone={notice.tone}>
            <p className={styles.noticeTitle}>{notice.title}</p>
            <p>{notice.body}</p>
          </div>
        ) : null}
      </div>
      <form className={styles.emailForm} onSubmit={submit} noValidate aria-label={r.title}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-email`}>{t.emailLabel}</label>
          <input ref={emailRef} className={styles.input} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required aria-invalid={state.kind === "invalid-email" || undefined} aria-describedby={state.kind === "invalid-email" ? `${id}-email-error` : undefined} />
          {state.kind === "invalid-email" ? <p className={styles.fieldError} id={`${id}-email-error`}>{t.states.invalidEmail}</p> : null}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-code`}>{r.codeLabel}</label>
          <input ref={codeRef} className={`${styles.input} ${styles.codeInput}`} id={`${id}-code`} name="code" type="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required maxLength={32} aria-invalid={state.kind === "bad-code" || state.kind === "missing-code" || undefined} aria-describedby={`${id}-code-hint`} />
          {codeError ? <p className={styles.fieldError}>{codeError}</p> : null}
          <p className={styles.hint} id={`${id}-code-hint`}>{r.codeHint}</p>
        </div>
        <PasswordField ref={passwordRef} locale={locale} label={r.newPassword} autoComplete="new-password" rules invalid={state.kind === "weak-password"} errorText={state.kind === "weak-password" ? fill(t.states.weakPassword, { n: PASSWORD_MIN }) : null} />
        <button type="submit" className={`button ${styles.submit}`} disabled={busy || (state.kind === "rate-limited" && left > 0)}>
          {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
          {busy ? r.busy : r.submit}
        </button>
      </form>
      <p className={styles.hint}>{r.noCodes}</p>
      <Link className={styles.forgot} href={`/${locale}/sign-in?mode=sign-in`}>{r.back}</Link>
    </div>
  );
}
