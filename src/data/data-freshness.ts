import { CORE_MAX } from "../engine/display-score";

/** Datasets shown in the data status block, in display order. */
export const DATASET_IDS = ["prices", "fundamentals", "filings", "insider", "macro", "news"] as const;
export type DatasetId = (typeof DATASET_IDS)[number];
export type DatasetDates = Record<DatasetId, string | null>;
export type DatasetState = "current" | "stale" | "none";

/**
 * Days after which a dataset reads "stale", counted from its newest stored date. One place to change them.
 * prices: a long weekend plus a missed run. fundamentals: a 10-Q lands about every 90 days plus filing lag.
 * filings, insider, news: event feeds with no fixed rhythm, so the limits are generous and a quiet ticker is not alarming.
 * macro: monthly releases, so 45 days.
 */
export const STALE_AFTER_DAYS: Record<DatasetId, number> = { prices: 5, fundamentals: 135, filings: 120, insider: 120, macro: 45, news: 14 };

const DAY = 86_400_000;

/** Missing date is "none"; a date older than the dataset limit is "stale". A future date counts as current. */
export function datasetState(id: DatasetId, date: string | null, now = Date.now()): DatasetState {
  if (!date) return "none";
  const day = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day)) return "none";
  return now - day > STALE_AFTER_DAYS[id] * DAY ? "stale" : "current";
}

/** The coverage guard from the scorer: below 80% of the core points with data the score is flagged incomplete. */
export const COVERAGE_GUARD_PERCENT = 80;
export const COVERAGE_GUARD_POINTS = Math.ceil(CORE_MAX * (COVERAGE_GUARD_PERCENT / 100));

export type CoverageLevel = "full" | "partial" | "limited" | "none";
export interface Coverage { known: number; total: number; points: number; pointsMax: number; guardPoints: number; level: CoverageLevel }

/** Input comes from displayScore: coreKnown, coreTotal, evidencedMax. Counts, not a judgement of the stock. */
export function coverageOf(coreKnown: number, coreTotal: number, evidencedMax: number): Coverage {
  const level: CoverageLevel = coreKnown <= 0 ? "none" : coreKnown >= coreTotal ? "full" : evidencedMax >= COVERAGE_GUARD_POINTS ? "partial" : "limited";
  return { known: coreKnown, total: coreTotal, points: evidencedMax, pointsMax: CORE_MAX, guardPoints: COVERAGE_GUARD_POINTS, level };
}
