"use client";
import { useId, useState } from "react";
import type { PriceVariantId } from "@/config/plans";
import type { Locale } from "@/i18n";
import type { LaunchMessages } from "@/i18n/launch-messages";
import { buildPayload, submitWaitlist, validEmail } from "./waitlist-client";
import styles from "./launch.module.css";

type Status = "idle" | "sending" | "done";

/** Waitlist signup. The page renders it only while the WAITLIST flag is on. Posts to /api/waitlist (W14). */
export function WaitlistForm({ copy, locale, variant }: { copy: LaunchMessages["form"]; locale: Locale; variant: PriceVariantId }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    if (!validEmail(email)) return setError(copy.errorEmail);
    if (!consent) return setError(copy.errorConsent);
    setError(null);
    setStatus("sending");
    const outcome = await submitWaitlist(buildPayload({ email, consent, website }, locale, variant));
    if (outcome === "ok") return setStatus("done");
    setStatus("idle");
    setError(outcome === "invalid" ? copy.errorInvalid : outcome === "rate_limited" ? copy.errorRate : copy.errorFailed);
  }

  if (status === "done") {
    return (
      <div className={styles.done} role="status">
        <strong>{copy.doneTitle}</strong>
        <p>{copy.doneBody}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate data-consent-version={copy.consentVersion}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-email`}>
          {copy.emailLabel}
        </label>
        <input className={styles.input} id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error === copy.errorEmail} aria-describedby={error ? `${id}-error` : undefined} />
      </div>
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor={`${id}-website`}>{copy.hidden}</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <label className={styles.consent}>
        <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{copy.consentLabel}</span>
      </label>
      {error ? (
        <p className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button className="button" type="submit" disabled={status === "sending"}>
          {status === "sending" ? copy.sending : copy.submit}
        </button>
      </div>
    </form>
  );
}
