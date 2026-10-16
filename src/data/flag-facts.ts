import { getPool } from "../db/pool";
import { fundamentalsHistory, type FundamentalsHistoryRow } from "../db/history";
import type { ShareCount } from "../engine/flags";
import { INTEREST_EXPENSE_CONCEPTS } from "./fundamentals-concepts";

/** Reported share counts (SEC cover page) from stored facts. Empty without a database or on any read error: the flag then shows no data. */
export async function storedShareCounts(ticker: string): Promise<ShareCount[]> {
  const db = getPool();
  if (!db) return [];
  try {
    const page = await fundamentalsHistory(db, ticker, "EntityCommonStockSharesOutstanding", { limit: 40 });
    return page.rows.map((row) => ({ periodEnd: row.periodEnd, value: row.value }));
  } catch {
    return [];
  }
}

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
export async function storedInterestFacts(ticker: string): Promise<InterestFacts> {
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
