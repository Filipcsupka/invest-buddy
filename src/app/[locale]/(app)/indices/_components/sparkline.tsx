import { fill, type Locale } from "@/i18n";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { day } from "./format";
import s from "./markets.module.css";

/** A small line of the last closes. It carries a text label, so the figures in the row stay the primary reading. */
export function Sparkline({ closes, name, first, last, locale }: { closes: number[]; name: string; first: string | null; last: string | null; locale: Locale }) {
  if (closes.length < 2) return null;
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const span = hi - lo || 1;
  const points = closes.map((close, i) => `${((i / (closes.length - 1)) * 100).toFixed(1)},${(28 - ((close - lo) / span) * 26 - 1).toFixed(1)}`).join(" ");
  const label = fill(getMarketsMessages(locale).sparkLabel, { name, count: closes.length, first: day(locale, first), last: day(locale, last) });
  return <svg className={s.spark} viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}><polyline points={points} /></svg>;
}
