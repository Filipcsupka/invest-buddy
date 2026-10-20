import Link from "next/link";
import { IconArrowRight } from "@/components/icons";
import { CountUp } from "@/components/kit/count-up";
import { StateChip } from "@/components/kit/state-chip";
import { fill, type Locale } from "@/i18n";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { getScannerBentoMessages } from "@/i18n/scanner-bento-messages";
import styles from "./scanner-bento.module.css";

export function ScannerBento({ locale, counts, total, labels, href }: {
  locale: Locale;
  counts: Record<StateKey, number>;
  total: number;
  labels: Record<StateKey, string>;
  href: (state: StateKey) => string;
}) {
  const copy = getScannerBentoMessages(locale);
  return <nav className={styles.grid} aria-label={copy.summary}>
    {stateOrder.map((state) => {
      const count = counts[state];
      const share = total ? count / total * 100 : 0;
      const unit = count === 1 ? copy.tickerOne : locale === "sk" && count >= 2 && count <= 4 ? copy.tickerFew : copy.tickerMany;
      return <Link key={state} className={styles.tile} data-state={state} href={href(state)} aria-label={fill(copy.jump, { count, unit, state: labels[state] })}>
        <span className={styles.top}><StateChip state={state} label={labels[state]} size="sm" /><span className={styles.arrow} aria-hidden="true"><IconArrowRight /></span></span>
        <CountUp value={count} locale={locale} className={styles.count} />
        <span className={styles.bar} aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
        <span className={styles.range}>{copy[state]}</span>
      </Link>;
    })}
  </nav>;
}
