import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight } from "@/components/icons";
import { IconLock } from "@/components/kit";
import styles from "./lock-card.module.css";

/**
 * One locked-feature pattern in four forms (funnel-design s3). Server-rendered, no client code.
 *
 * - `control`: a disabled control with a one-line note. Scanner filters.
 * - `depth`: real rows up to the free limit, then "Showing N of M". N and M are the same for every free viewer.
 * - `teaser`: one static SAMPLE row that demonstrates a column. Never personalised.
 * - `card`: a plain card for a feature with no cheap illustration.
 *
 * The locked content itself is never in the HTML (no blur over real rows): callers pass only sample or aggregate content. The word
 * "Plus" is always printed, so the lock never rests on colour. No modal, no countdown, no scarcity.
 */
export type PlusLockProps = {
  /** The printed tier word, "Plus". */
  badge: string;
  title: string;
  note: string;
  action: { href: string; label: string };
} & (
  | { form: "control"; control: ReactNode }
  | { form: "depth"; summary: string; children: ReactNode }
  | { form: "teaser"; sampleLabel: string; children: ReactNode }
  | { form: "card" }
);

function Badge({ label }: { label: string }) {
  return (
    <span className={styles.badge}>
      <IconLock />
      <span>{label}</span>
    </span>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <Link className={`arrow-link ${styles.action}`} href={href}>
      {label}
      <IconArrowRight />
    </Link>
  );
}

export function PlusLock(props: PlusLockProps) {
  const { badge, title, note, action } = props;
  if (props.form === "control") {
    return (
      <div className={styles.lock} data-form="control">
        <div className={styles.control} aria-disabled="true">{props.control}</div>
        <p className={styles.note}>
          <Badge label={badge} />
          <span>{note}</span>
        </p>
        <Action {...action} />
      </div>
    );
  }
  if (props.form === "depth") {
    return (
      <div className={styles.lock} data-form="depth">
        {props.children}
        <p className={styles.depth}>
          <Badge label={badge} />
          <span className="num">{props.summary}</span>
        </p>
        <p className={styles.note}>{note}</p>
        <Action {...action} />
      </div>
    );
  }
  if (props.form === "teaser") {
    return (
      <div className={styles.lock} data-form="teaser">
        <p className={styles.head}>
          <span className={styles.title}>{title}</span>
          <Badge label={badge} />
          <span className="stamp">{props.sampleLabel}</span>
        </p>
        {props.children}
        <p className={styles.note}>{note}</p>
        <Action {...action} />
      </div>
    );
  }
  return (
    <aside className={styles.lock} data-form="card" aria-label={title}>
      <p className={styles.head}>
        <span className={styles.title}>{title}</span>
        <Badge label={badge} />
      </p>
      <p className={styles.note}>{note}</p>
      <Action {...action} />
    </aside>
  );
}
