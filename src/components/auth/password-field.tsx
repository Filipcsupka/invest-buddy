"use client";
import { forwardRef, useId, useState } from "react";
import { PASSWORD_MIN } from "@/auth/client-api";
import { fill, type Locale } from "@/i18n";
import { getAuthMessages } from "@/i18n/auth-messages";
import styles from "./auth.module.css";

interface Props {
  locale: Locale;
  label: string;
  /** `new-password` for sign-up and reset, `current-password` for sign-in. Password managers read this. */
  autoComplete: "new-password" | "current-password";
  /** Show the length rule under the field and tick it once met. */
  rules?: boolean;
  invalid?: boolean;
  errorText?: string | null;
  name?: string;
}

/** Password input with a show/hide toggle and, for new passwords, the length rule checked as you type. */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField({ locale, label, autoComplete, rules = false, invalid = false, errorText = null, name = "password" }, ref) {
  const t = getAuthMessages(locale);
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [length, setLength] = useState(0);
  const met = length >= PASSWORD_MIN;
  const ruleId = `${id}-rule`;
  const errorId = `${id}-error`;
  const describedBy = [errorText ? errorId : null, rules ? ruleId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`${id}-input`}>{label}</label>
      <div className={styles.passwordWrap}>
        <input
          ref={ref}
          className={`${styles.input} ${styles.passwordInput}`}
          id={`${id}-input`}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={rules ? PASSWORD_MIN : undefined}
          maxLength={128}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => setLength(event.currentTarget.value.length)}
        />
        <button type="button" className={styles.reveal} onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-controls={`${id}-input`} aria-label={visible ? t.hideLabel : t.showLabel}>
          {visible ? t.hide : t.show}
        </button>
      </div>
      {errorText ? <p className={styles.fieldError} id={errorId}>{errorText}</p> : null}
      {rules ? (
        <p className={styles.rule} id={ruleId} data-met={met ? "" : undefined}>
          <span className={styles.ruleMark} aria-hidden="true" />
          <span>{fill(t.rule, { n: PASSWORD_MIN })}</span>
          <span className={`${styles.ruleCount} num`} aria-hidden="true">{fill(t.ruleCount, { count: Math.min(length, 999), n: PASSWORD_MIN })}</span>
        </p>
      ) : null}
    </div>
  );
});
