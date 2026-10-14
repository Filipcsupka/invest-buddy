"use client";
import { useId, useState, type FormEvent } from "react";
import { submitSignup, type SubmitResult } from "@/waitlist/submit";
import type { Messages } from "@/i18n";
import styles from "./waitlist-form.module.css";

export type WaitlistLabels = Messages["waitlist"];

const errorKey = { email: "errorEmail", consent: "errorConsent", rate: "errorRate", error: "errorGeneric" } as const;

/** Double opt-in sign-up. Shows the same success text whether or not the address was already known. */
export function WaitlistForm({ locale, labels, source, priceVariant }: { locale: "en" | "sk"; labels: WaitlistLabels; source?: string; priceVariant?: string }) {
  const id = useId();
  const [state, setState] = useState<"idle" | "sending" | SubmitResult>("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState("sending");
    setState(await submitSignup({
      email: String(data.get("email") ?? ""),
      locale,
      consentLaunch: data.get("consentLaunch") === "on",
      consentWeekly: data.get("consentWeekly") === "on",
      website: String(data.get("website") ?? ""),
      ...(source ? { source } : {}),
      ...(priceVariant ? { priceVariant } : {}),
    }));
  }

  if (state === "ok") return <p className={styles.ok} role="status">{labels.success}</p>;
  const failed = state !== "idle" && state !== "sending" ? state : null;
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{labels.formTitle}</h2>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-email`}>{labels.email}</label>
        <input className={styles.input} id={`${id}-email`} name="email" type="email" autoComplete="email" required aria-invalid={failed === "email"} aria-describedby={failed === "email" ? `${id}-error` : undefined} />
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="consentLaunch" required aria-invalid={failed === "consent"} />
        <span>{labels.consentLaunch}</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" name="consentWeekly" />
        <span>{labels.consentWeekly}</span>
      </label>
      <div className={styles.trap} aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {failed ? <p className={styles.error} id={`${id}-error`} role="alert">{labels[errorKey[failed]]}</p> : null}
      <button className="button" type="submit" disabled={state === "sending"}>{state === "sending" ? labels.sending : labels.submit}</button>
    </form>
  );
}
