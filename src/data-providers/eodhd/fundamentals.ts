import type { EpsQuarter } from "../../collectors/sources/common";
import type { FundamentalRow } from "../../collectors/sources/companyfacts";
import type { EarningsCalendar, Fundamentals } from "./client";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const number = (value: unknown): number | null => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const quarterStart = (end: string, previousEnd?: string): string => {
  const endDay = Date.parse(`${end}T00:00:00Z`);
  if (previousEnd) {
    const prior = Date.parse(`${previousEnd}T00:00:00Z`);
    const span = (endDay - prior) / 86_400_000;
    if (span >= 70 && span <= 105) return new Date(prior + 86_400_000).toISOString().slice(0, 10);
  }
  const e = new Date(endDay);
  const targetYear = e.getUTCFullYear();
  const targetMonth = e.getUTCMonth() - 3;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const previous = Date.UTC(targetYear, targetMonth, Math.min(e.getUTCDate(), lastDay));
  return new Date(previous + 86_400_000).toISOString().slice(0, 10);
};
const period = (end: string) => ({ fy: Number(end.slice(0, 4)), fp: `Q${Math.floor((Number(end.slice(5, 7)) - 1) / 3) + 1}` });

export function parseEodhdEarnings(data: Fundamentals, asOf: string): EpsQuarter[] {
  const history = object(data.Earnings?.History);
  return Object.entries(history).flatMap(([key, raw]) => {
    const row = object(raw);
    const fiscalDateEnding = date(key) ? key : date(row.date) ? row.date : null;
    const reportedDate = date(row.reportDate) ? row.reportDate : null;
    if (!fiscalDateEnding || !reportedDate || reportedDate > asOf) return [];
    return [{ fiscalDateEnding, reportedDate, reportedEps: number(row.epsActual), estimatedEps: number(row.epsEstimate), surprisePct: number(row.surprisePercent) }];
  }).sort((a, b) => a.fiscalDateEnding.localeCompare(b.fiscalDateEnding));
}

/** Only rows with a known report or filing date can enter point-in-time storage. */
export function parseEodhdFundamentals(data: Fundamentals, ticker: string, asOf: string) {
  const earnings = parseEodhdEarnings(data, asOf);
  const reports = new Map(earnings.map((row) => [row.fiscalDateEnding, row.reportedDate!]));
  const rows: FundamentalRow[] = [];
  const income = object(object(data.Financials).Income_Statement);
  const quarters = Object.entries(object(income.quarterly)).map(([key, raw]) => {
    const item = object(raw);
    return { item, end: date(item.date) ? item.date : date(key) ? key : null };
  }).filter((row): row is { item: Record<string, unknown>; end: string } => row.end !== null).sort((a, b) => a.end.localeCompare(b.end));
  for (const [index, { item, end }] of quarters.entries()) {
    const value = number(item.totalRevenue);
    if (value === null || value <= 0) continue;
    const filed = date(item.filing_date) ? item.filing_date : date(item.reportDate) ? item.reportDate : reports.get(end);
    if (!filed || filed > asOf || filed < end) continue;
    const unit = typeof item.currency_symbol === "string" && /^[A-Z]{3}$/.test(item.currency_symbol) ? item.currency_symbol : data.General?.CurrencyCode;
    if (!unit || !/^[A-Z]{3}$/.test(unit)) continue;
    rows.push({ ticker, taxonomy: "eodhd", concept: "Revenues", unit, periodStart: quarterStart(end, quarters[index - 1]?.end), periodEnd: end,
      ...period(end), form: "EODHD", filed, accession: `eodhd:revenue:${end}:${filed}`, value, frame: null });
  }
  for (const [key, raw] of Object.entries(object(data.outstandingShares?.quarterly))) {
    const item = object(raw);
    const end = date(item.date) ? item.date : date(key) ? key : null;
    if (!end) continue;
    const shares = number(item.shares);
    const millions = number(item.sharesMln);
    const value = shares ?? (millions === null ? null : millions * 1_000_000);
    const filed = date(item.filing_date) ? item.filing_date : date(item.reportDate) ? item.reportDate : reports.get(end);
    if (!filed || filed > asOf || filed < end || value === null || value <= 0) continue;
    rows.push({ ticker, taxonomy: "eodhd", concept: "EntityCommonStockSharesOutstanding", unit: "shares", periodStart: null,
      periodEnd: end, ...period(end), form: "EODHD", filed, accession: `eodhd:shares:${end}:${filed}`, value, frame: null });
  }
  return { rows, earnings };
}

export interface CalendarObservation { vendorSymbol: string; reportDate: string; fiscalDateEnding: string | null; estimate: number | null; currency: string | null; timeOfDay: string | null }
export function parseEodhdCalendar(data: EarningsCalendar, from: string, to: string): CalendarObservation[] {
  if (!Array.isArray(data.earnings)) throw new Error("EODHD earnings calendar has no earnings array");
  return data.earnings.flatMap((row) => {
    const reportDate = date(row.report_date) ? row.report_date : null;
    if (!row.code || !reportDate || reportDate < from || reportDate > to) return [];
    return [{ vendorSymbol: row.code, reportDate, fiscalDateEnding: date(row.date) ? row.date : null, estimate: number(row.estimate),
      currency: typeof row.currency === "string" ? row.currency : null, timeOfDay: typeof row.before_after_market === "string" ? row.before_after_market : null }];
  });
}
