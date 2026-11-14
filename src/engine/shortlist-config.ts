import { SCANNER_FLOOR } from "@/app/[locale]/(app)/scanner/floor";

/**
 * Shortlist thresholds (N1, docs/shortlist.md). Draft values from the 2026-11-12 research note; the owner has not signed them off.
 * The shortlist is an informational view over names whose displayed state is Setup met. It never changes a score, state or history.
 */
export const SHORTLIST_CONFIG = {
  version: "2026-11-14.1",
  /** F1 full evidence: points with data, out of 25, at or above this. The score's coverage guard is 20 (src/engine/relative.ts). */
  minEvidencedPoints: 23,
  /** F2 leadership: percentile of the price return over `rsSessions` inside the scored universe. IBD/O'Neil use RS rank 80. */
  minRsPercentile: 80,
  /** Sessions for the relative strength return. The listing read keeps 64 bars (LISTING_BAR_LIMIT), so 63 sessions is about 3 months. */
  rsSessions: 63,
  /** F2 liquidity: average daily traded value in USD over `tradedValueSessions`. Same floor as the scanner (scanner/floor.ts). */
  minTradedValueUsd: SCANNER_FLOOR.minAvgDollarVolumeUsd,
  tradedValueSessions: SCANNER_FLOOR.days,
  /** ATR window for the atrPercent tie-breaker. Same as the horizon profile (src/engine/horizon.ts). */
  atrSessions: 14,
  /** F3 event risk, flag only: an earnings report within this many NYSE sessions after the score date. */
  reportWithinSessions: 5,
  /** F3 event risk, flag only: close more than this percent below the highest high of the last `drawdownSessions`. */
  maxDrawdownPercent: 25,
  drawdownSessions: 63,
  /** Concentration lens: a sector group above this share of the shortlist is flagged (SEC 25% industry test, MSCI capped indexes). */
  sectorShareFlagPercent: 30,
  /** Top picks block (S1): names shown before the full list. SHORTLIST_TOP_N overrides it within topNMin..topNMax. */
  topN: 6,
  topNMin: 1,
  topNMax: 15,
  /** Model portfolio lens (S1): a theme above this share of the model portfolio counts as above its cap. Draft. */
  themeCapPercent: 25,
  /** Model portfolio lens (S1): a sector group above this share is noted; same draft value as the owner SECTOR_CAP. */
  sectorGroupCapPercent: 30,
} as const;

export type ShortlistConfig = { [K in keyof typeof SHORTLIST_CONFIG]: (typeof SHORTLIST_CONFIG)[K] extends string ? string : number };
