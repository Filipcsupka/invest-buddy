import type { ReactNode } from "react";
import { SampleStamp } from "./operator-disclosure";
import styles from "./app-page.module.css";

/** Class for the page frame under the header. */
export const appPageClass = `frame page ${styles.page}`;

/** App-style page header: title with the SAMPLE badge, a lede, a meta row (last update, status), and actions on the right. */
export function AppPageHead({ title, sample, sampleText, lede, meta, actions }: { title: string; sample?: boolean; sampleText?: string; lede?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.head}>
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {sample && sampleText ? <SampleStamp text={sampleText} /> : null}
        </div>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

/** Small pill for a meta row. */
export function MetaChip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

/** Operator disclosure line under the header. */
export function HeadDisclosure({ text }: { text: string }) {
  return text.trim() ? <p className={styles.disclosure}>{text}</p> : null;
}
