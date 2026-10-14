import { notFound } from "next/navigation";
import { displayScore } from "@/engine/display-score";
import { instrumentUniverse, latestScores } from "@/data/store";
import { formatDate, formatScorePercent, getMessages, isLocale } from "@/i18n";
import { stateKey } from "@/i18n/score-text";
import { companyImage, OG_CONTENT_TYPE, OG_SIZE } from "@/og/card";

// Same data loaders as the page, so the image follows the W5 cache (300 s, purged with the page data).
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "InvestBuddy";

export default async function Image({ params }: { params: Promise<{ locale: string; ticker: string }> }) {
  const { locale, ticker } = await params;
  if (!isLocale(locale)) notFound();
  const symbol = ticker.toUpperCase();
  const instrument = (await instrumentUniverse()).find((item) => item.ticker === symbol);
  if (!instrument) notFound();
  const result = (await latestScores()).rows.find((row) => row.instrument.ticker === symbol)?.result;
  const m = getMessages(locale);
  const display = result ? displayScore(stateKey(result.state), result.ruleHits) : null;
  return companyImage({
    siteName: m.meta.siteName,
    ticker: symbol,
    name: instrument.name,
    score: display?.percent == null ? m.common.noScore : formatScorePercent(locale, display.percent),
    state: display ? m.states[display.state] : m.states.insufficient,
    date: result?.asOf ? formatDate(locale, result.asOf) : "",
    disclaimer: m.common.disclaimer,
  });
}
