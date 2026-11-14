/**
 * Inputs to the index market-condition rating (src/markets/index-rating.ts).
 * Percentages are 0..100. Every `coveragePct` is the share of the index's current constituents that had data for that
 * figure; the rating engine decides whether the coverage is enough. A missing block means the figure was not assessed.
 */
export interface IndexRatingInputs {
  /** Vendor symbol of the index, for example GSPC.INDX. */
  symbol: string;
  /** ISO date of the latest index bar or current constituent snapshot, whichever is newer. */
  asOf: string;
  /** Daily closes in ascending date order, up to about five years. */
  bars: { date: string; close: number }[];
  /** Constituents mapped to our instruments through the security master, out of the latest stored list. */
  components?: { matched: number; total: number };
  /** Share of constituents with stored bars that close above their MA50 / MA200. */
  breadth?: { date: string; aboveMa50Pct: number; aboveMa200Pct: number; coveragePct: number };
  /** Weighted share of constituents with positive year-on-year growth, and with growth faster than the prior quarter's. */
  earnings?: { date: string; positiveGrowthPct: number; acceleratingPct: number; coveragePct: number };
  /** Index valuation is not collected yet. */
  valuation?: null;
  /** Share of scored constituents whose latest rule state is Setup met / Criteria broken. */
  scoreDistribution?: { date: string; setupMetPct: number; criteriaBrokenPct: number; coveragePct: number };
  /** True for a volatility index (VIX): its level is context, never an equity-market condition input. */
  isVolatilityIndex: boolean;
}

/** A figure with the denominator and date it was measured on. */
export interface Covered<T> { value: T; n: number; of: number; asOf: string | null }
