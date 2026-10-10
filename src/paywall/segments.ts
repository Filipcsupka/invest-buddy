/**
 * Page segments that may sit behind a paywall once InvestBuddy takes users (task B3).
 * Today every segment is visible to everyone. The marker only tags the markup so the gate can be added later in one place.
 * Add an id here and wrap the section in <PaywallSegment id="..."> when a new segment is a candidate.
 */
export const PAYWALL_SEGMENTS = {
  "scanner-rows-full": "Scanner results beyond the free row limit",
  "idea-card": "Latest trade idea: action, size tier, what happened, why, setup, numbers, plan and evidence",
  "portfolio-performance": "Indexed portfolio performance, benchmark comparison and return details",
  "portfolio-weights": "Current portfolio position weights",
  "track-record-signals": "Dated signal outcomes and forward return windows",
  "track-record-history": "Historical score snapshots and their ticker details",
  "track-record-benchmark": "Sample benchmark chart in fixture mode",
  "sizing-matrix": "Account size and signal tier percentage matrix",
  "sizing-cash": "Cash band rules for applying size tiers",
  "sizing-add": "Rules for adding to or reducing a position",
  "sizing-example": "Worked sizing example",
  "owner-cash": "Private owner cash and reserve breakdown",
  "owner-suggestions": "Private owner allocation suggestions",
} as const satisfies Record<string, string>;
export type PaywallSegmentId = keyof typeof PAYWALL_SEGMENTS;
