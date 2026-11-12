import Link from "next/link";
import { fill, type Locale } from "@/i18n";
import { getScoreStripMessages } from "@/i18n/score-strip-messages";
import type { ScreenRow } from "./view-model";
import styles from "./score-strip.module.css";

/** How many names the strip shows. Twelve links keep the dashboard payload small however large the universe is. */
export const SCORE_STRIP_LIMIT = 12;

/**
 * Ranked strip from the Welcome page, fed by the rows the dashboard already loaded: the top names by score, each a link to its
 * company page and coloured by rule state. No new query and no new data; rows without a score are left out.
 */
export function ScoreStrip({ locale, rows }: { locale: Locale; rows: ScreenRow[] }) {
  const t = getScoreStripMessages(locale);
  const ranked = rows.filter((row) => row.percent !== null).slice(0, SCORE_STRIP_LIMIT);
  if (ranked.length === 0) return null;
  return (
    <section className={`kit-card ${styles.card}`} aria-labelledby="score-strip-title">
      <h2 id="score-strip-title" className={styles.title}>{t.title}</h2>
      <ol className={styles.strip}>
        {ranked.map((row) => (
          <li key={row.ticker} data-state={row.state} style={{ flexGrow: Math.max(row.percent ?? 30, 30) }}>
            <Link href={`/${locale}/company/${row.ticker}`} aria-label={fill(t.ariaItem, { ticker: row.ticker, state: row.stateLabel, score: row.percentLabel ?? "" })}>
              {row.ticker}
              <span className="num">{row.percentLabel}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className={styles.note}>{fill(t.note, { n: ranked.length, total: rows.length })}</p>
    </section>
  );
}
