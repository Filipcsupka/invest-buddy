/**
 * Registry of page segment ids that <PaywallSegment> can mark. The tier of each id (free, paid lock, paid with a depth limit)
 * lives in src/config/tiers.ts, which is typed by the keys of this object, so a new id without a tier fails the type check.
 * Owner sections are not here: they stay behind OWNER_VIEW and have no tier.
 */
export const PAYWALL_SEGMENTS = {
  "scanner-rows-full": "Scanner results beyond the free row limit",
  "scanner-filters-advanced": "Scanner score range, minimum F/T/M, source and held filters, sort by F/T/M",
  "scanner-streak": "Scanner rules-met streak in days, gained and lost counts",
  "insiders-history": "Insider events older than the free window",
  "ideas-list": "Ideas list page content",
  "idea-card": "Latest trade idea: action, size tier, what happened, why, setup, numbers, plan and evidence",
  "score-history": "Score history per ticker: total score by scan day, parts and state",
  "portfolio-performance": "Indexed portfolio performance, benchmark comparison and return details",
  "portfolio-weights": "Current portfolio position weights",
  "track-record-periods": "Track record by-period table",
  "track-record-signals": "Dated signal outcomes and forward return windows",
  "track-record-history": "Historical score snapshots and their ticker details",
  "track-record-worst": "The five weakest stored outcomes, one per ticker and date",
  "track-record-benchmark": "Sample benchmark chart in fixture mode",
  "sizing-matrix": "Account size and signal tier percentage matrix",
  "sizing-cash": "Cash band rules for applying size tiers",
  "sizing-add": "Rules for adding to or reducing a position",
  "sizing-example": "Worked sizing example",
} as const satisfies Record<string, string>;
export type PaywallSegmentId = keyof typeof PAYWALL_SEGMENTS;
