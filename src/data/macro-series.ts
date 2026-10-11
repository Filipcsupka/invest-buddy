/**
 * Macro series stored in `macro_observations` (D24). FRED series are listed here only after their notes were read for the
 * word "Copyright" (`scripts/fred-check-notes.ts`). VIX is not stored: the Cboe source is internal_only, see docs/data.md.
 */
export interface FredSeries { id: string; title: string; frequency: "daily" | "monthly"; /** Observations kept by the daily refresh. */ dailyLimit: number }

export const FRED_MACRO_SERIES: readonly FredSeries[] = [
  { id: "DGS2", title: "2-year Treasury yield", frequency: "daily", dailyLimit: 80 },
  { id: "DGS10", title: "10-year Treasury yield", frequency: "daily", dailyLimit: 80 },
  { id: "DGS3MO", title: "3-month Treasury yield", frequency: "daily", dailyLimit: 80 },
  { id: "T10Y2Y", title: "10-year minus 2-year spread", frequency: "daily", dailyLimit: 80 },
  { id: "FEDFUNDS", title: "Effective federal funds rate", frequency: "monthly", dailyLimit: 24 },
  { id: "CPIAUCSL", title: "CPI, all urban consumers", frequency: "monthly", dailyLimit: 24 },
  { id: "PPIACO", title: "PPI, all commodities", frequency: "monthly", dailyLimit: 24 },
];
/** Series whose FRED notes carry a copyright statement. Never stored. Filled from the script's output. */
export const FRED_REJECTED_SERIES: readonly string[] = [];
export const storableFredSeries = (): FredSeries[] => FRED_MACRO_SERIES.filter((series) => !FRED_REJECTED_SERIES.includes(series.id));

/** Treasury daily par yield curve (cross-check of the FRED constant-maturity series). CSV column to stored series id. */
export const TREASURY_COLUMNS: Readonly<Record<string, string>> = { "3 Mo": "TSY_3M", "2 Yr": "TSY_2Y", "10 Yr": "TSY_10Y" };
export const TREASURY_SERIES_IDS: readonly string[] = Object.values(TREASURY_COLUMNS);

/** First day of the backfilled history. Same start as the other D-lane backfills (Form 4, 8-K). */
export const MACRO_HISTORY_START = "2023-10-01";

/** True when a FRED series' notes contain the word "copyright" (any case). */
export const notesMentionCopyright = (notes: string | null | undefined): boolean => /copyright/i.test(notes ?? "");

/** Splits candidate series ids into storable and rejected, given each series' FRED notes. A series with no notes entry is rejected (not checked). */
export function checkSeriesNotes(ids: readonly string[], notes: Readonly<Record<string, string | null | undefined>>): { storable: string[]; rejected: { id: string; reason: string }[] } {
  const storable: string[] = [], rejected: { id: string; reason: string }[] = [];
  for (const id of ids) {
    if (!(id in notes)) rejected.push({ id, reason: "notes not checked" });
    else if (notesMentionCopyright(notes[id])) rejected.push({ id, reason: "notes mention copyright" });
    else storable.push(id);
  }
  return { storable, rejected };
}
