import type { Technicals } from "../data/technicals";
import { computeSignals, SIGNAL_RULES, type Signal, type SignalField, type SignalSymbolInput } from "./signals";
import { SCORE_RULES_VERSION } from "./score";

/**
 * Golden fixtures freeze what the score and signal rules decide today, so a rule change shows a per ticker diff.
 * A fixture holds the inputs of the data-only signal and the expected output. It never holds EUR amounts, cost basis, positions or the holdings flag.
 */
export interface GoldenExpected {
  action: Signal["action"];
  sizeTier: Signal["sizeTier"];
  ratings: Signal["ratings"];
  points: Signal["points"];
  unconfirmed: boolean;
  carriedFrom: string | null;
  confirmedFields: string[];
  reasons: string[];
}
export interface GoldenSymbol {
  symbol: string;
  score: { total: number; technical: number; fundamentals: number; macro: number; state: string };
  matchedRules: string[];
  fields: Record<string, SignalField>;
  expiredFields: string[];
  technicals: Technicals | null;
  expected: GoldenExpected;
}
export interface GoldenFixture {
  description: string;
  asOf: string;
  signalRulesVersion: string;
  scoreRulesVersion: string;
  symbols: GoldenSymbol[];
}

/** The part of a judge-input symbol the golden fixture keeps. Structural, so the route output and test data both fit. */
export interface GoldenSource {
  symbol: string;
  score: { total: number; technical: number; fundamentals: number; macro: number; state: string };
  matchedRules: string[];
  fields: Record<string, { value: boolean | null; agreement: string; verified: boolean; carriedFrom: string | null }>;
  expiredFields: string[];
  technicals: Technicals | null;
}

export const goldenInput = (s: GoldenSymbol): SignalSymbolInput => ({ symbol: s.symbol, held: null, score: { total: s.score.total, state: s.score.state }, fields: s.fields, expiredFields: s.expiredFields, technicals: s.technicals });

export const expectedFrom = (s: Signal): GoldenExpected => ({
  action: s.action, sizeTier: s.sizeTier, ratings: s.ratings, points: s.points, unconfirmed: s.unconfirmed,
  carriedFrom: s.carriedFrom, confirmedFields: s.confirmedFields, reasons: s.reasons,
});

/** Builds a fixture from judge-input symbols with the current rules, sorted by symbol. Keeps only whitelisted fields, so holdings and evidence cannot leak in. */
export function buildGolden(sources: GoldenSource[], asOf: string, description: string): GoldenFixture {
  const symbols: GoldenSymbol[] = [...sources].sort((a, b) => a.symbol.localeCompare(b.symbol)).map((s) => ({
    symbol: s.symbol,
    score: { total: s.score.total, technical: s.score.technical, fundamentals: s.score.fundamentals, macro: s.score.macro, state: s.score.state },
    matchedRules: [...s.matchedRules],
    fields: Object.fromEntries(Object.entries(s.fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, f]) => [k, { value: f.value, agreement: f.agreement, verified: f.verified, carriedFrom: f.carriedFrom }])),
    expiredFields: [...s.expiredFields].sort(),
    technicals: s.technicals,
    expected: undefined as unknown as GoldenExpected,
  }));
  const signals = computeSignals(symbols.map(goldenInput), null);
  for (const g of symbols) g.expected = expectedFrom(signals.find((x) => x.symbol === g.symbol)!);
  return { description, asOf, signalRulesVersion: SIGNAL_RULES.version, scoreRulesVersion: SCORE_RULES_VERSION, symbols };
}
