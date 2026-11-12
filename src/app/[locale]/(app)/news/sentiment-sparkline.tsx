import { sentimentSeries, type SentimentPointView } from "@/db/news";
import { fill, formatDate, formatNumber, type Locale } from "@/i18n";
import { getFlowMessages } from "@/i18n/flow-messages";
import styles from "../economy/flow.module.css";

const W = 160, H = 40, PAD = 3;

/**
 * Daily vendor news sentiment (-1 to 1) for one EODHD symbol, as a small line with a zero baseline. Fact only: no state, score or call.
 * Pass stored points; `SentimentSparkline` below reads them. Owner-only data: place it only on a page that has passed assertViewable().
 */
export function SentimentSparklineView({ locale, symbol, points }: { locale: Locale; symbol: string; points: SentimentPointView[] }) {
  const m = getFlowMessages(locale).sentiment;
  if (!points.length) return <p className="rp-empty">{m.empty}</p>;
  const x = (i: number) => PAD + (points.length === 1 ? (W - 2 * PAD) / 2 : (i / (points.length - 1)) * (W - 2 * PAD));
  const y = (score: number) => PAD + (1 - (Math.max(-1, Math.min(1, score)) + 1) / 2) * (H - 2 * PAD);
  const last = points[points.length - 1];
  const value = formatNumber(locale, last.score, 2);
  const articles = last.count === null ? "?" : formatNumber(locale, last.count);
  const aria = fill(m.aria, { symbol, count: points.length, first: formatDate(locale, points[0].date), last: formatDate(locale, last.date), value, articles });
  const d = points.map((point, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(point.score).toFixed(1)}`).join("");
  return (
    <figure className={styles.spark} data-sentiment-sparkline={symbol}>
      <svg className={styles.sparkSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} focusable="false">
        <line className={styles.sparkZero} x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} />
        {points.length > 1 ? <path className={styles.sparkLine} d={d} /> : <circle className={styles.sparkLine} cx={x(0)} cy={y(last.score)} r={2} />}
      </svg>
      <figcaption className={styles.sparkCaption}>{fill(m.latest, { value, articles })}. {m.note}</figcaption>
    </figure>
  );
}

/** Reads and renders the stored news sentiment series. */
export async function SentimentSparkline({ locale, symbol, days = 30 }: { locale: Locale; symbol: string; days?: number }) {
  return <SentimentSparklineView locale={locale} symbol={symbol} points={await sentimentSeries(symbol, days)} />;
}
