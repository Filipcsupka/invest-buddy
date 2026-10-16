import type { Locale } from "@/i18n";
import { tickerSeoText } from "@/seo/ticker-text";
import type { ScoreResult } from "@/engine";

/** One neutral sentence block from the numbers, visible so the page text matches its meta description. */
export function TickerSeoSummary({ locale, ticker, name, result }: { locale: Locale; ticker: string; name: string; result: Pick<ScoreResult, "state" | "asOf" | "ruleHits"> | null }) {
  const text = tickerSeoText(locale, ticker, name, result);
  return text ? <p className="seo-summary" data-seo-summary="">{text.summary}</p> : null;
}
