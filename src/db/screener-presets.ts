/**
 * The ten stored screens. Each one is a plain fact filter on vendor fields (size, sector, dividend yield,
 * new 200-day high), never a score or a call. On 2026-11-06 a live /screener response returned
 * `dividend_yield` as a fraction (0.003 for AAPL), `market_capitalization` in units of the listing currency,
 * and accepted the lower-case exchange code `us`. The `xetra` code is UNVERIFIED.
 */
export type ScreenerFilter = [field: string, op: "=" | ">" | "<" | ">=" | "<=", value: string | number];
export interface ScreenerPreset { id: string; filters: ScreenerFilter[]; signals?: string; sort: string; limit: number }

const BN = 1_000_000_000;
const us: ScreenerFilter = ["exchange", "=", "us"];
const xetra: ScreenerFilter = ["exchange", "=", "xetra"];
const byCap = "market_capitalization.desc";

export const SCREENER_PRESETS: readonly ScreenerPreset[] = [
  { id: "us-mega-cap", filters: [us, ["market_capitalization", ">", 200 * BN]], sort: byCap, limit: 100 },
  { id: "us-large-cap", filters: [us, ["market_capitalization", ">=", 10 * BN], ["market_capitalization", "<=", 200 * BN]], sort: byCap, limit: 100 },
  { id: "us-mid-cap", filters: [us, ["market_capitalization", ">=", 2 * BN], ["market_capitalization", "<", 10 * BN]], sort: byCap, limit: 100 },
  { id: "us-dividend", filters: [us, ["market_capitalization", ">=", 2 * BN], ["dividend_yield", ">=", 0.03]], sort: "dividend_yield.desc", limit: 100 },
  { id: "us-200d-high", filters: [us, ["market_capitalization", ">=", 2 * BN]], signals: "200d_new_hi", sort: byCap, limit: 100 },
  { id: "us-technology", filters: [us, ["sector", "=", "Technology"], ["market_capitalization", ">=", 10 * BN]], sort: byCap, limit: 100 },
  { id: "us-healthcare", filters: [us, ["sector", "=", "Healthcare"], ["market_capitalization", ">=", 10 * BN]], sort: byCap, limit: 100 },
  { id: "us-financials", filters: [us, ["sector", "=", "Financial Services"], ["market_capitalization", ">=", 10 * BN]], sort: byCap, limit: 100 },
  { id: "xetra-large-cap", filters: [xetra, ["market_capitalization", ">", 10 * BN]], sort: byCap, limit: 100 },
  { id: "xetra-dividend", filters: [xetra, ["market_capitalization", ">=", 1 * BN], ["dividend_yield", ">=", 0.03]], sort: "dividend_yield.desc", limit: 100 },
];

export const presetById = (id: string | undefined): ScreenerPreset | undefined => SCREENER_PRESETS.find((preset) => preset.id === id);
