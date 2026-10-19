import type pg from "pg";
import { estimateRevision, REVISION_LOOKBACK_DAYS, type EstimateObservation, type EstimateRevisionFact } from "../data/estimate-revisions";

export interface StoredEstimateObservation extends EstimateObservation { ticker: string }

/**
 * Calendar rows for `tickers` observed on or before `asOf` and within the revision lookback. Report dates before the
 * lookback start are left out; a moved report date inside it stays in, so the baseline can still match by fiscal quarter.
 */
export async function storedEstimateObservations(db: Pick<pg.Pool, "query">, tickers: string[], asOf: string, lookbackDays = REVISION_LOOKBACK_DAYS): Promise<StoredEstimateObservation[]> {
  if (!tickers.length) return [];
  const result = await db.query<StoredEstimateObservation>(
    `SELECT ticker, observed_on::text AS "observedOn", report_date::text AS "reportDate", fiscal_date_ending::text AS "fiscalDateEnding", estimate::float8 AS estimate
       FROM earnings_calendar_snapshots
      WHERE ticker = ANY($1::text[]) AND observed_on <= $2::date AND observed_on >= $2::date - $3::int AND report_date >= $2::date - $3::int
      ORDER BY ticker, observed_on, report_date`, [tickers, asOf, lookbackDays]);
  return result.rows;
}

/** Estimate revision fact per ticker as of `asOf`. A ticker with no upcoming report in the stored calendar is absent. Owner view only. */
export async function estimateRevisions(db: Pick<pg.Pool, "query">, tickers: string[], asOf: string): Promise<Map<string, EstimateRevisionFact>> {
  const byTicker = new Map<string, StoredEstimateObservation[]>();
  for (const row of await storedEstimateObservations(db, tickers, asOf)) {
    const list = byTicker.get(row.ticker);
    if (list) list.push(row); else byTicker.set(row.ticker, [row]);
  }
  const out = new Map<string, EstimateRevisionFact>();
  for (const [ticker, rows] of byTicker) {
    const fact = estimateRevision(ticker, rows, asOf);
    if (fact) out.set(ticker, fact);
  }
  return out;
}
