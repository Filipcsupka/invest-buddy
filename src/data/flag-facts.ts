import { getPool } from "../db/pool";
import { fundamentalsHistory, type FundamentalsHistoryRow } from "../db/history";
import type { ShareCount } from "../engine/flags";
import { INTEREST_EXPENSE_CONCEPTS } from "./fundamentals-concepts";
import { eodhdPrivateUse } from "./eodhd-private-use";
import { CACHE_TAGS, webCached } from "./web-cache";

/** Reported share counts from stored facts. EODHD is used in private mode, with SEC as the fallback. */
async function storedShareCountsUncached(ticker: string, privateUse: boolean): Promise<ShareCount[]> {
  const db = getPool();
  if (!db) return [];
  try {
    if (privateUse) {
      const vendor = await db.query<{ periodEnd: string; value: string | number }>(`SELECT period_end::text AS "periodEnd", value FROM fundamentals_pit
        WHERE ticker=$1 AND concept='EntityCommonStockSharesOutstanding' AND source_id='eodhd'
          AND filed <= CURRENT_DATE AND first_seen_at::date <= CURRENT_DATE
        ORDER BY period_end DESC, filed DESC, id DESC LIMIT 40`, [ticker]);
      if (vendor.rows.length) return vendor.rows.map((row) => ({ periodEnd: row.periodEnd, value: Number(row.value) }));
    }
    const page = await fundamentalsHistory(db, ticker, "EntityCommonStockSharesOutstanding", { limit: 40 });
    return page.rows.map((row) => ({ periodEnd: row.periodEnd, value: row.value }));
  } catch {
    return [];
  }
}
const cachedStoredShareCounts = webCached(storedShareCountsUncached, "stored-share-counts", [CACHE_TAGS.scores], { bypass: () => !getPool() });
export const storedShareCounts = (ticker: string) => cachedStoredShareCounts(ticker.toUpperCase(), eodhdPrivateUse());

export interface InterestFacts { operatingIncome: number | null; interestExpense: number | null }

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/** Latest filing per annual period (10-K, full fiscal year, 350 to 380 days). A restated fact replaces the earlier one. */
function annualByPeriod(rows: readonly FundamentalsHistoryRow[]): Map<string, number> {
  const best = new Map<string, FundamentalsHistoryRow>();
  for (const row of rows) {
    if (!row.form.startsWith("10-K") || row.fp !== "FY" || !row.periodStart || row.unit !== "USD") continue;
    const length = days(row.periodStart, row.periodEnd);
    if (!(length >= 350 && length <= 380) || !Number.isFinite(row.value)) continue;
    const seen = best.get(row.periodEnd);
    if (!seen || row.filed > seen.filed) best.set(row.periodEnd, row);
  }
  return new Map([...best].map(([end, row]) => [end, row.value]));
}

/**
 * Operating income and interest expense for the latest fiscal year with operating income, both from the same period.
 * Interest expense is the first concept in INTEREST_EXPENSE_CONCEPTS with an annual fact for that period. A reported 0
 * stays 0 (no interest to cover); no fact for the period stays null (no data). Pure.
 */
export function pickInterestFacts(operatingIncomeRows: readonly FundamentalsHistoryRow[], interestRows: Readonly<Record<string, readonly FundamentalsHistoryRow[]>>): InterestFacts {
  const income = annualByPeriod(operatingIncomeRows);
  const period = [...income.keys()].sort().at(-1);
  if (!period) return { operatingIncome: null, interestExpense: null };
  for (const concept of INTEREST_EXPENSE_CONCEPTS) {
    const value = annualByPeriod(interestRows[concept] ?? []).get(period);
    if (value !== undefined) return { operatingIncome: income.get(period)!, interestExpense: value };
  }
  return { operatingIncome: income.get(period)!, interestExpense: null };
}

/** Stored annual operating income and interest expense. Nulls without a database or on any read error: the flag then shows no data. */
async function storedInterestFactsUncached(ticker: string): Promise<InterestFacts> {
  const db = getPool();
  if (!db) return { operatingIncome: null, interestExpense: null };
  try {
    const read = async (concept: string) => (await fundamentalsHistory(db, ticker, concept, { limit: 80 })).rows;
    const operatingIncome = await read("OperatingIncomeLoss");
    const interest: Record<string, FundamentalsHistoryRow[]> = {};
    for (const concept of INTEREST_EXPENSE_CONCEPTS) interest[concept] = await read(concept);
    return pickInterestFacts(operatingIncome, interest);
  } catch {
    return { operatingIncome: null, interestExpense: null };
  }
}
const cachedStoredInterestFacts = webCached(storedInterestFactsUncached, "stored-interest-facts", [CACHE_TAGS.scores], { bypass: () => !getPool() });
export const storedInterestFacts = (ticker: string) => cachedStoredInterestFacts(ticker.toUpperCase());

/** Latest reported share count per ticker in one query (scanner floor). Missing tickers are absent; empty without a database or on any read error. */
async function latestShareCountsUncached(tickers: string[], privateUse: boolean): Promise<Record<string, number>> {
  const db = getPool();
  if (!db || !tickers.length) return {};
  try {
    const result = await db.query<{ ticker: string; value: string | number }>(
      `SELECT DISTINCT ON (f.ticker) f.ticker, f.value FROM fundamentals_pit f
       WHERE f.ticker = ANY($1) AND f.concept = 'EntityCommonStockSharesOutstanding'
         AND (EXISTS (SELECT 1 FROM data_sources s WHERE s.id = f.source_id AND s.display_allowed)
              OR ($2::boolean AND f.source_id = 'eodhd'))
       ORDER BY f.ticker, f.period_end DESC, f.filed DESC, f.id DESC`, [tickers, privateUse]);
    return Object.fromEntries(result.rows.map((row) => [row.ticker, Number(row.value)] as const).filter(([, value]) => Number.isFinite(value)));
  } catch {
    return {};
  }
}
const cachedLatestShareCounts = webCached(latestShareCountsUncached, "latest-share-counts", [CACHE_TAGS.scores], { bypass: () => !getPool() });
export const latestShareCounts = (tickers: readonly string[]) => tickers.length
  ? cachedLatestShareCounts([...new Set(tickers.map((ticker) => ticker.toUpperCase()))].sort(), eodhdPrivateUse())
  : Promise.resolve({} as Record<string, number>);
