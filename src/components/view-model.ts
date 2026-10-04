import type { ScoreResult } from "@/engine";
import type { Instrument } from "@/data/providers";
import { fill, formatDate, getMessages, type Locale } from "@/i18n";
import { reasonsFor, sectorLabel, stateKey } from "@/i18n/score-text";
import type { StateKey } from "@/i18n/rules";

/** Everything a table row needs, already localized and serializable for client components. */
export type ScreenRow = {
  ticker: string;
  name: string;
  sector: string;
  extension: boolean;
  date: string;
  dateLabel: string;
  total: number;
  fundamentals: number;
  technical: number;
  macro: number;
  state: StateKey;
  stateLabel: string;
  pullbackLabel: string | null;
  matched: string[] | null;
  markLabel: string;
  reasons: string[];
};

export function toRow(locale: Locale, { instrument, result }: { instrument: Instrument; result: ScoreResult }): ScreenRow {
  const m = getMessages(locale);
  const state = stateKey(result.state);
  const scored = state !== "insufficient";
  return {
    ticker: instrument.ticker,
    name: instrument.name,
    sector: sectorLabel(locale, instrument.sector),
    extension: instrument.source === "sample extension",
    date: result.asOf,
    dateLabel: formatDate(locale, result.asOf),
    total: result.total,
    fundamentals: result.fundamentals,
    technical: result.technical,
    macro: result.macro,
    state,
    stateLabel: m.states[state],
    pullbackLabel: state === "watch" && result.pullbackInUptrend ? m.states.pullback : null,
    matched: scored ? result.ruleHits.filter((hit) => hit.matched).map((hit) => hit.id) : null,
    markLabel: scored ? fill(m.mark.label, { total: result.total, fundamentals: result.fundamentals, technical: result.technical, macro: result.macro }) : m.mark.none,
    reasons: reasonsFor(locale, result),
  };
}

export const byScore = (a: ScreenRow, b: ScreenRow) => b.total - a.total || a.ticker.localeCompare(b.ticker);
