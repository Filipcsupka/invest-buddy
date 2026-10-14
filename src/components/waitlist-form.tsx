"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { track } from "@/analytics/events";
import { submitSignup, type SubmitResult } from "@/waitlist/submit";
import type { Messages } from "@/i18n";
import styles from "./waitlist-form.module.css";

export type WaitlistLabels = Messages["waitlist"];

const errorKey = { email: "errorEmail", consent: "errorConsent", rate: "errorRate", error: "errorGeneric" } as const;

interface Props {
  locale: "en" | "sk";
  labels: WaitlistLabels;
  source?: string;
  priceVariant?: string;
  /** Hide the form's own heading when the page already has one above it. The form keeps an accessible name. */
  hideTitle?: boolean;
}

/** Double opt-in sign-up. Shows the same success text whether or not the address was already known. */
export function WaitlistForm({ locale, labels, source, priceVariant, hideTitle = false }: Props) {
  const id = useId();
  const [state, setState] = useState<"idle" | "sending" | SubmitResult>("idle");
  const eventProps = { locale, ...(source ? { source } : {}), ...(priceVariant ? { variant: priceVariant } : {}) };

  useEffect(() => {
    track("waitlist_view", eventProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState("sending");
    const result = await submitSignup({
      email: String(data.get("email") ?? ""),
      locale,
      consentLaunch: data.get("consentLaunch") === "on",
      consentWeekly: data.get("consentWeekly") === "on",
      website: String(data.get("website") ?? ""),
      ...(source ? { source } : {}),
      ...(priceVariant ? { priceVariant } : {}),
    });
    if (result === "ok") track("waitlist_submit", eventProps);
    setState(result);
  }

  if (state === "ok") return <p className={styles.ok} role="status">{labels.success}</p>;
  const failed = state !== "idle" && state !== "sending" ? state : null;
  const errorId = `${id}-error`;
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate {...(hideTitle ? { "aria-label": labels.formTitle } : { "aria-labelledby": `${id}-title` })}>
      {hideTitle ? null : <h2 id={`${id}-title`}>{labels.formTitle}</h2>}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-email`}>{labels.email}</label>
        <input className={styles.input} id={`${id}-email`} name="email" type="email" autoComplete="email" required aria-invalid={failed === "email"} aria-describedby={failed === "email" ? errorId : undefined} />
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="consentLaunch" required aria-invalid={failed === "consent"} aria-describedby={failed === "consent" ? errorId : undefined} />
        <span>{labels.consentLaunch}</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" name="consentWeekly" />
        <span>{labels.consentWeekly}</span>
      </label>
      <div className={styles.trap} aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {failed ? <p className={styles.error} id={errorId} role="alert">{labels[errorKey[failed]]}</p> : null}
      <button className="button" type="submit" disabled={state === "sending"}>{state === "sending" ? labels.sending : labels.submit}</button>
    </form>
  );
}
