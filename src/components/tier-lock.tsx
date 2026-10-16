import { IconLock } from "./kit/kit-icons";
import styles from "./tier.module.css";

/** Small "Paid" marker. `label` is the localized text. Uses the kit tier look without the kit `data-tier` attribute, which the rendered-page tests ban. */
export function TierBadge({ segmentId, label, title }: { segmentId: string; label: string; title?: string }) {
  return <span className={styles.badge} data-tier-badge={segmentId} title={title}>{label}</span>;
}

/** Card shown to a free viewer instead of a paid segment. `label` is the heading, `body` says what is behind it. */
export function TierLock({ segmentId, label, body }: { segmentId: string; label: string; body: string }) {
  return (
    <aside className={styles.lock} data-paywall-candidate={segmentId} data-tier-lock={segmentId} aria-label={label}>
      <p className={styles.lockTitle}><IconLock />{label}</p>
      <p className={styles.lockBody}>{body}</p>
    </aside>
  );
}

/** One-line depth note under a limited segment. */
export function TierNote({ segmentId, text }: { segmentId: string; text: string }) {
  return <p className={styles.note} data-tier-note={segmentId}>{text}</p>;
}
