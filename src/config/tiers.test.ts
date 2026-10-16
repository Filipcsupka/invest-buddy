import { expect, it } from "vitest";
import { PAYWALL_SEGMENTS } from "@/paywall/segments";
import { FEATURES, FEATURE_TIERS, TIERS, TIER_LIMITS, tierEntry, type LimitKey } from "./tiers";

/** The id column of docs/tier-map.md (PR #212), as agreed: free, lock (paid) or limit (paid, depth-limited). */
const expected: Record<string, string> = {
  "scanner-rows-full": "free",
  "scanner-filters-advanced": "lock",
  "scanner-streak": "lock",
  "insiders-history": "limit:insiderDays",
  "ideas-list": "lock",
  "idea-card": "lock",
  "score-history": "limit:scoreHistoryDays",
  "portfolio-performance": "free",
  "portfolio-weights": "free",
  "track-record-periods": "free",
  "track-record-signals": "free",
  "track-record-history": "free",
  "track-record-worst": "free",
  "track-record-benchmark": "free",
  "sizing-matrix": "free",
  "sizing-cash": "free",
  "sizing-add": "free",
  "sizing-example": "free",
  "discovery-list": "lock",
  "saved-screens": "limit:savedScreens",
  watchlist: "limit:watchlistTickers",
  "alerts-weekly": "free",
  "alerts-daily": "limit:alerts",
  "csv-export": "lock",
};

const describe = (id: string) => {
  const e = tierEntry(id as never);
  return e.tier === "free" ? "free" : e.mode === "lock" ? "lock" : `limit:${e.limit}`;
};

it("gives every registry id and feature id a tier, matching the tier map", () => {
  expect(Object.keys(TIERS).sort()).toEqual(Object.keys(PAYWALL_SEGMENTS).sort());
  expect(Object.keys(FEATURE_TIERS).sort()).toEqual([...FEATURES].sort());
  const all = [...Object.keys(PAYWALL_SEGMENTS), ...FEATURES];
  expect(Object.fromEntries(all.map((id) => [id, describe(id)]))).toEqual(expected);
});

it("keeps owner ids out of the map", () => {
  for (const id of ["owner-cash", "owner-suggestions"]) {
    expect(id in TIERS).toBe(false);
    expect(id in PAYWALL_SEGMENTS).toBe(false);
  }
});

it("names a TIER_LIMITS key for every limit entry, in both columns", () => {
  for (const entry of [...Object.values(TIERS), ...Object.values(FEATURE_TIERS)]) {
    if (entry.tier === "paid" && entry.mode === "limit") {
      expect(entry.limit in TIER_LIMITS.free).toBe(true);
      expect(entry.limit in TIER_LIMITS.paid).toBe(true);
    }
  }
  expect(Object.keys(TIER_LIMITS.free).sort()).toEqual(Object.keys(TIER_LIMITS.paid).sort());
});

it("holds the proposed free defaults", () => {
  const free: Record<LimitKey, number | null> = { scoreHistoryDays: 90, scannerRows: null, savedScreens: 1, alerts: 3, watchlistTickers: 10, insiderDays: 180, trackRecordHistoryDays: null };
  expect(TIER_LIMITS.free).toEqual(free);
});
