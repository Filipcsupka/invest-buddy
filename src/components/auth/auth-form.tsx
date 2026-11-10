"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { passwordOk, sendMagicLink, signInWithPassword, signUpWithPassword, validEmail, PASSWORD_MIN, type CallbackError, type Failure } from "@/auth/client-api";
import { fill, type Locale } from "@/i18n";
import { getAuthMessages } from "@/i18n/auth-messages";
import { PasswordField } from "./password-field";
import { RecoveryCodes } from "./recovery-codes";
import styles from "./auth.module.css";

export const RESEND_SECONDS = 60;
export type AuthMode = "sign-up" | "sign-in";

/** Every state the screen can be in. `sending-*` disables all methods so a double tap sends nothing twice. */
export type AuthState =
  | { kind: "idle" }
  | { kind: "sending-password" }
  | { kind: "sending-link" }
  | { kind: "recovery"; email: string; codes: string[] | null }
  | { kind: "sent"; email: string }
  | { kind: "invalid-email" }
  | { kind: "weak-password" }
  | { kind: "wrong-credentials" }
  | { kind: "exists" }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "rate-limited"; retryAfter: number | null }
  | { kind: "network" }
  | { kind: "unavailable" }
  | { kind: "error" };

export function initialState(error: CallbackError | null): AuthState {
  if (error === "expired") return { kind: "expired" };
  if (error === "denied") return { kind: "denied" };
  if (error === "rate-limited") return { kind: "rate-limited", retryAfter: null };
  if (error === "error") return { kind: "error" };
  return { kind: "idle" };
}

const fromFailure = (failure: Failure): AuthState => (failure.kind === "error" ? { kind: "error" } : failure);

interface Props {
  locale: Locale;
  /** Validated same-site path to land on after sign-in. */
  next: string;
  /** Error from a failed redirect back to the sign-in page. */
  error?: CallbackError | null;
  /** Which tab opens first. Sign-up by default; the header "Sign in" entry opens sign-in. */
  mode?: AuthMode;
  /** The heading level the surrounding page needs. The dialog and the page use 1 or 2; the Welcome close card hides it. */
  headingLevel?: 1 | 2;
  hideHeading?: boolean;
  /** False while AUTH is off: show the "opens soon" notice only, with no form that could do nothing. */
  available?: boolean;
  /** Email sign-in link as a secondary path. Off at launch: there is no email provider. */
  magicLink?: boolean;
  /** Test hook: replaces `fetch` and the navigation after a successful sign-in. */
  deps?: { fetcher?: typeof fetch; navigate?: (url: string) => void };
}

/** Email and password. One screen for sign-up and sign-in. Sign-up ends on the recovery codes screen. */
export function AuthForm({ locale, next, error = null, mode: initialMode = "sign-up", headingLevel = 1, hideHeading = false, available = true, magicLink = false, deps }: Props) {
  const t = getAuthMessages(locale);
  const id = useId();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [state, setState] = useState<AuthState>(() => initialState(error));
  const [left, setLeft] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const busy = state.kind === "sending-password" || state.kind === "sending-link";
  const fetcher = deps?.fetcher;
  const navigate = deps?.navigate ?? ((url: string) => window.location.assign(url));
  const errorCallbackURL = `/${locale}/sign-in?next=${encodeURIComponent(next)}`;

  // Countdown after a 429 with Retry-After, and the resend timer of the optional email link.
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  // Move focus to the status block when a result arrives, so keyboard and screen reader users land on it.
  useEffect(() => {
    if (["unavailable", "network", "rate-limited", "error", "wrong-credentials", "exists"].includes(state.kind)) statusRef.current?.focus();
  }, [state.kind]);

  function settle(result: AuthState) {
    if (result.kind === "rate-limited" && result.retryAfter) setLeft(result.retryAfter);
    if (result.kind === "invalid-email") emailRef.current?.focus();
    if (result.kind === "weak-password") passwordRef.current?.focus();
    setState(result);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!validEmail(email)) return settle({ kind: "invalid-email" });
    if (mode === "sign-up" && !passwordOk(password)) return settle({ kind: "weak-password" });
    setState({ kind: "sending-password" });
    try {
      if (mode === "sign-up") {
        const outcome = await signUpWithPassword({ email, password, callbackURL: next, marketing: data.get("marketing") === "on" }, fetcher);
        if (outcome.kind === "signed-up") return setState({ kind: "recovery", email, codes: outcome.recoveryCodes });
        return settle(outcome.kind === "exists" ? outcome : fromFailure(outcome));
      }
      const outcome = await signInWithPassword({ email, password, callbackURL: next }, fetcher);
      if (outcome.kind === "signed-in") return navigate(next);
      settle(outcome.kind === "wrong-credentials" ? outcome : fromFailure(outcome));
    } catch {
      settle({ kind: "network" });
    }
  }

  async function emailLink() {
    if (busy) return;
    const email = emailRef.current?.value.trim() ?? "";
    if (!validEmail(email)) return settle({ kind: "invalid-email" });
    setState({ kind: "sending-link" });
    const outcome = await sendMagicLink({ email, callbackURL: next, errorCallbackURL }, fetcher);
    if (outcome.kind === "sent") {
      setLeft(RESEND_SECONDS);
      return setState({ kind: "sent", email });
    }
    settle(fromFailure(outcome));
  }

  function switchMode(to: AuthMode) {
    setMode(to);
    if (state.kind !== "idle" && state.kind !== "denied") setState({ kind: "idle" });
  }

  const H = headingLevel === 1 ? "h1" : "h2";
  const titleId = `${id}-title`;
  const errorId = `${id}-email-error`;

  if (state.kind === "recovery") {
    return <RecoveryCodes locale={locale} email={state.email} initial={state.codes} onContinue={() => navigate(next)} headingLevel={headingLevel} fetcher={fetcher} />;
  }

  if (state.kind === "sent") {
    return (
      <div className={styles.form} data-state="sent">
        <div className={styles.sent} role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>
          <MailMark />
          <H className={styles.noticeTitle}>{t.states.sentTitle}</H>
          <p>{fill(t.states.sentBody, { email: state.email })}</p>
          <p className={styles.timer} aria-live="off">{left > 0 ? fill(t.states.resendIn, { seconds: left }) : " "}</p>
          <div className={styles.sentActions}>
            <button type="button" className={styles.textButton} onClick={() => { setState({ kind: "idle" }); setLeft(0); }}>{t.states.changeEmail}</button>
          </div>
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className={styles.form} data-state="unavailable" data-mode={initialMode}>
        {hideHeading ? null : (
          <header className={styles.head}>
            <H className={styles.title} id={titleId}>{t.title}</H>
          </header>
        )}
        <div className={styles.status} role="status" aria-live="polite">
          <div className={styles.notice} data-tone="info">
            <p className={styles.noticeTitle}>{t.states.unavailableTitle}</p>
            <p>{t.states.unavailableBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const notice = noticeFor(state, t, left);
  const signUp = mode === "sign-up";
  return (
    <div className={styles.form} data-state={state.kind} data-mode={mode} aria-busy={busy || undefined}>
      {hideHeading ? null : (
        <header className={styles.head}>
          <H className={styles.title} id={titleId}>{t.title}</H>
          <p className={styles.lede}>{t.lede}</p>
        </header>
      )}
      <div className={styles.modes} role="group" aria-label={t.modes.label}>
        <button type="button" aria-pressed={signUp} onClick={() => switchMode("sign-up")}>{t.modes.signUp}</button>
        <button type="button" aria-pressed={!signUp} onClick={() => switchMode("sign-in")}>{t.modes.signIn}</button>
      </div>
      <div className={styles.status} role="status" aria-live="polite" tabIndex={-1} ref={statusRef}>
        {notice ? (
          <div className={styles.notice} data-tone={notice.tone}>
            <p className={styles.noticeTitle}>{notice.title}</p>
            <p>{notice.body}</p>
            {state.kind === "exists" ? <button type="button" className={styles.textButton} onClick={() => switchMode("sign-in")}>{t.states.existsAction}</button> : null}
            {state.kind === "wrong-credentials" ? <Link className={styles.noticeLink} href={`/${locale}/reset`}>{t.forgot}</Link> : null}
          </div>
        ) : null}
      </div>
      <form className={styles.emailForm} onSubmit={submit} noValidate aria-label={signUp ? t.modes.signUp : t.modes.signIn}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-email`}>{t.emailLabel}</label>
          <input
            ref={emailRef}
            className={styles.input}
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete={signUp ? "email" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={state.kind === "invalid-email" || undefined}
            aria-describedby={state.kind === "invalid-email" ? errorId : undefined}
          />
          {state.kind === "invalid-email" ? <p className={styles.fieldError} id={errorId}>{t.states.invalidEmail}</p> : null}
        </div>
        <PasswordField
          key={mode}
          ref={passwordRef}
          locale={locale}
          label={t.passwordLabel}
          autoComplete={signUp ? "new-password" : "current-password"}
          rules={signUp}
          invalid={state.kind === "weak-password"}
          errorText={state.kind === "weak-password" ? fill(t.states.weakPassword, { n: PASSWORD_MIN }) : null}
        />
        {signUp ? (
          <label className={styles.check}>
            <input type="checkbox" name="marketing" />
            <span>{t.marketing}</span>
          </label>
        ) : (
          <Link className={styles.forgot} href={`/${locale}/reset`}>{t.forgot}</Link>
        )}
        <button type="submit" className={`button ${signUp ? "cta" : ""} ${styles.submit}`} disabled={busy || (state.kind === "rate-limited" && left > 0)}>
          {state.kind === "sending-password" ? <span className={styles.spinner} aria-hidden="true" /> : null}
          {state.kind === "sending-password" ? (signUp ? t.signUpBusy : t.signInBusy) : signUp ? t.signUpSubmit : t.signInSubmit}
        </button>
        {magicLink && !signUp ? (
          <button type="button" className={styles.textButton} onClick={emailLink} disabled={busy}>{state.kind === "sending-link" ? t.emailBusy : t.magicLink}</button>
        ) : null}
      </form>
      <p className={styles.consent}>{fillLinks(t.consent, {
        terms: <Link href={`/${locale}/legal/terms`}>{t.terms}</Link>,
        privacy: <Link href={`/${locale}/legal/privacy`}>{t.privacy}</Link>,
      })}</p>
    </div>
  );
}

type Notice = { tone: "info" | "warn" | "error"; title: string; body: string };

export function noticeFor(state: AuthState, t: ReturnType<typeof getAuthMessages>, left: number): Notice | null {
  const s = t.states;
  switch (state.kind) {
    case "wrong-credentials": return { tone: "error", title: s.wrongTitle, body: s.wrongBody };
    case "exists": return { tone: "info", title: s.existsTitle, body: s.existsBody };
    case "expired": return { tone: "warn", title: s.expiredTitle, body: s.expiredBody };
    case "denied": return { tone: "warn", title: s.deniedTitle, body: s.deniedBody };
    case "rate-limited": return { tone: "warn", title: s.rateTitle, body: left > 0 ? fill(s.rateBody, { seconds: left }) : s.rateBodyPlain };
    case "network": return { tone: "error", title: s.networkTitle, body: s.networkBody };
    case "unavailable": return { tone: "info", title: s.unavailableTitle, body: s.unavailableBody };
    case "error": return { tone: "error", title: s.errorTitle, body: s.errorBody };
    default: return null;
  }
}

/** Fill `{name}` slots in a sentence with React nodes (links), keeping the text order of each locale. */
export function fillLinks(template: string, slots: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1];
    return key && key in slots ? <span key={i}>{slots[key]}</span> : part;
  });
}

function MailMark() {
  return (
    <svg className={styles.mailMark} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="6" y="11" width="36" height="26" rx="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="m8 14 16 12 16-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
