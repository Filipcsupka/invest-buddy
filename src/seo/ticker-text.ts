import type { ScoreResult } from "@/engine";
import { CORE_RULES, displayScore } from "@/engine/display-score";
import { fill, formatDate, getMessages, plural, type Locale } from "@/i18n";
import { stateKey } from "@/i18n/score-text";
import { seoMessages } from "@/i18n/seo-messages";

export interface TickerSeoText {
  title: string;
  description: string;
  /** One short visible paragraph for the company page. */
  summary: string;
}

/**
 * Neutral per-ticker text from the numbers: core rules met, rule state, as-of date and data coverage.
 * Pure. Returns null when the ticker has no stored score, so the caller keeps its existing text.
 * Uses the same counts as the page (displayScore). No price, no rating, no action wording, so ADVICE_OUTPUT does not change it.
 */
export function tickerSeoText(locale: Locale, ticker: string, name: string, result: Pick<ScoreResult, "state" | "asOf" | "ruleHits"> | null): TickerSeoText | null {
  if (!result) return null;
  const t = seoMessages[locale];
  const m = getMessages(locale);
  const label = name === ticker ? ticker : `${ticker}, ${name}`;
  const date = result.asOf ? formatDate(locale, result.asOf) : "";
  const display = displayScore(stateKey(result.state), result.ruleHits);
  if (display.state === "insufficient") {
    return {
      title: fill(t.titleNoScore, { label }),
      description: fill(t.descriptionNoScore, { ticker, date: date || "-" }),
      summary: fill(t.summaryNoScore, { ticker, date: date || "-" }),
    };
  }
  const core = new Set<string>(CORE_RULES.map((rule) => rule.id));
  const met = result.ruleHits.filter((hit) => hit.matched === true && core.has(hit.id)).length;
  const values = { ticker, label, date, met, rules: plural(locale, t.rulesTotal, display.coreTotal), state: m.states[display.state], known: display.coreKnown };
  return {
    title: fill(t.title, values),
    description: fill(date ? t.description : t.descriptionNoDate, values),
    summary: fill(date ? t.summary : t.summaryNoDate, values),
  };
}
