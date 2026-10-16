import { PAYWALL_SEGMENTS, type PaywallSegmentId } from "@/paywall/segments";

/**
 * Free, paid and admin tiers in one place (design: docs/tier-map.md). Pure data.
 * Pages, the pricing table and later the alert job read tiers and limits from here only.
 */
export type LimitKey = "scoreHistoryDays" | "scannerRows" | "savedScreens" | "alerts" | "watchlistTickers" | "insiderDays" | "trackRecordHistoryDays";

/** Ids that are not page markers yet. They move into the registry (src/paywall/segments.ts) when a page marks them. */
export const FEATURES = ["discovery-list", "saved-screens", "watchlist", "alerts-weekly", "alerts-daily", "csv-export"] as const;
export type FeatureId = (typeof FEATURES)[number];
export type TierId = PaywallSegmentId | FeatureId;

/** free: no gate. lock: a free viewer gets a lock card. limit: a free viewer gets the content up to TIER_LIMITS.free[limit] plus a note. */
export type TierEntry = { tier: "free" } | { tier: "paid"; mode: "lock" } | { tier: "paid"; mode: "limit"; limit: LimitKey };

const free: TierEntry = { tier: "free" };
const lock: TierEntry = { tier: "paid", mode: "lock" };
const limit = (key: LimitKey): TierEntry => ({ tier: "paid", mode: "limit", limit: key });

/** Typed by the registry keys: a segment id without a tier here fails tsc. Owner ids are not in the registry and have no tier. */
export const TIERS: Record<PaywallSegmentId, TierEntry> = {
  "scanner-rows-full": limit("scannerRows"),
  "scanner-filters-advanced": lock,
  "scanner-streak": lock,
  "insiders-history": limit("insiderDays"),
  "ideas-list": lock,
  "idea-card": lock,
  "score-history": limit("scoreHistoryDays"),
  "portfolio-performance": free,
  "portfolio-weights": free,
  "track-record-periods": lock,
  "track-record-signals": lock,
  "track-record-history": limit("trackRecordHistoryDays"),
  "track-record-worst": lock,
  "track-record-benchmark": free,
  "sizing-matrix": free,
  "sizing-cash": free,
  "sizing-add": free,
  "sizing-example": free,
};

export const FEATURE_TIERS: Record<FeatureId, TierEntry> = {
  "discovery-list": lock,
  "saved-screens": limit("savedScreens"),
  watchlist: limit("watchlistTickers"),
  "alerts-weekly": free,
  "alerts-daily": limit("alerts"),
  "csv-export": lock,
};

export function tierEntry(id: TierId): TierEntry {
  return id in PAYWALL_SEGMENTS ? TIERS[id as PaywallSegmentId] : FEATURE_TIERS[id as FeatureId];
}

/**
 * Depth limits. Proposed defaults, OWNER TO CONFIRM (docs/tier-map.md section 3). null means no limit.
 * `paid` is also what admin gets; the paid caps only stop abuse.
 */
export const TIER_LIMITS: { free: Record<LimitKey, number | null>; paid: Record<LimitKey, number | null> } = {
  free: { scoreHistoryDays: 30, scannerRows: 20, savedScreens: 1, alerts: 3, watchlistTickers: 10, insiderDays: 90, trackRecordHistoryDays: 1 },
  paid: { scoreHistoryDays: null, scannerRows: null, savedScreens: 20, alerts: 50, watchlistTickers: 200, insiderDays: null, trackRecordHistoryDays: null },
};
