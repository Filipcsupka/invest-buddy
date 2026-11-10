"use client";
import { useEffect, useRef, useState } from "react";
import { createRecoveryCodes, recoveryCodesFile, type CodesOutcome } from "@/auth/client-api";
import { fill, type Locale } from "@/i18n";
import { getAuthMessages } from "@/i18n/auth-messages";
import styles from "./auth.module.css";

interface Props {
  locale: Locale;
  email: string;
  /** Codes that came back with the sign-up answer. When null they are requested from /api/auth/recovery/codes. */
  initial: string[] | null;
  onContinue: () => void;
  headingLevel?: 1 | 2;
  fetcher?: typeof fetch;
}

/**
 * Shown once, right after sign-up. Ten codes, copy and download as .txt, and a checkbox the visitor ticks before Continue unlocks.
 * The copy is plain about the stakes: there is no email reset, so without a code a lost password stays lost.
 */
export function RecoveryCodes({ locale, email, initial, onContinue, headingLevel = 1, fetcher }: Props) {
  const t = getAuthMessages(locale).recovery;
  const [codes, setCodes] = useState<string[] | null>(initial);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const H = headingLevel === 1 ? "h1" : "h2";

  async function load() {
    setFailed(false);
    const outcome: CodesOutcome = await createRecoveryCodes(fetcher);
    if (outcome.kind === "codes") setCodes(outcome.codes);
    else setFailed(true);
  }

  useEffect(() => {
    heading.current?.focus();
    if (initial) return;
    let live = true;
    void createRecoveryCodes(fetcher).then((outcome) => {
      if (!live) return;
      if (outcome.kind === "codes") setCodes(outcome.codes);
      else setFailed(true);
    });
    return () => { live = false; };
  }, [initial, fetcher]);

  const file = codes ? recoveryCodesFile(codes, fill(t.fileHeader, { email })) : "";

  async function copy() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(file);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* Clipboard blocked: the download and the visible list still work. */
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([file], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "investbuddy-recovery-codes.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={styles.form} data-state="recovery">
      <header className={styles.head}>
        <H className={styles.title} ref={heading} tabIndex={-1}>{t.title}</H>
        <p className={styles.lede}>{t.lede}</p>
      </header>
      {failed ? (
        <div className={styles.notice} data-tone="error" role="alert">
          <p className={styles.noticeTitle}>{t.failedTitle}</p>
          <p>{t.failedBody}</p>
          <button type="button" className="button secondary" onClick={load}>{t.retry}</button>
        </div>
      ) : codes ? (
        <>
          <ol className={styles.codes} aria-label={t.listLabel}>
            {codes.map((code) => <li key={code} className="num">{code}</li>)}
          </ol>
          <p className={styles.hint}>{t.each}</p>
          <div className={styles.codeActions}>
            <button type="button" className="button secondary" onClick={copy}>{copied ? t.copied : t.copy}</button>
            <button type="button" className="button secondary" onClick={download}>{t.download}</button>
            <span className={styles.visuallyHidden} role="status" aria-live="polite">{copied ? t.copied : ""}</span>
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.currentTarget.checked)} />
            <span>{t.confirm}</span>
          </label>
          <button type="button" className={`button cta ${styles.submit}`} disabled={!saved} onClick={onContinue}>{t.continue}</button>
        </>
      ) : (
        <p className={styles.loading} role="status" aria-live="polite"><span className={styles.spinner} aria-hidden="true" />{t.loading}</p>
      )}
    </div>
  );
}
