import type { FlexRaw } from "./flex";

export interface EurPosition { symbol: string; quantity: number; valueEur: number; costEur: number }
export interface EurPortfolio {
  /** Report date YYYY-MM-DD, or null when the statement has no toDate. */
  asOf: string | null;
  fromDate: string | null;
  positions: EurPosition[];
  cashEur: number;
  nav: { start: number; end: number; deposits: number };
  /** Counts and labels only. No amounts, symbols or account ids. */
  warnings: { skippedPositions: number; skippedCashRows: number; cashSource: "sum" | "base-summary" | "sum-base-mismatch" };
}

export function isoFlexDate(raw: unknown): string | null {
  const text = String(raw ?? "");
  const date = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}` : text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : null;
}

function num(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const cur = (raw: unknown) => String(raw ?? "").trim().toUpperCase();

/** Latest reportDate rate per currency into EUR. EUR itself is 1. A currency with no rate is absent: never guessed or inverted. */
export function latestEurRates(rates: Record<string, unknown>[]): Map<string, number> {
  const best = new Map<string, { date: string; rate: number }>();
  for (const row of rates) {
    if (cur(row.toCurrency) !== "EUR") continue;
    const from = cur(row.fromCurrency);
    const date = isoFlexDate(row.reportDate);
    const rate = num(row.rate);
    if (!from || !date || rate === null || rate <= 0) continue;
    const seen = best.get(from);
    if (!seen || date > seen.date) best.set(from, { date, rate });
  }
  const out = new Map<string, number>([["EUR", 1]]);
  for (const [from, v] of best) if (from !== "EUR") out.set(from, v.rate);
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const BASE_ROW = /^BASE(_SUMMARY)?$/;

export function toEurPortfolio(raw: FlexRaw): EurPortfolio {
  if (!raw.navSummary) throw new Error("Flex ChangeInNAV summary missing");
  const start = num(raw.navSummary.startingValue);
  const end = num(raw.navSummary.endingValue);
  if (start === null || end === null) throw new Error("Flex NAV values invalid");
  const deposits = num(raw.navSummary.depositsWithdrawals) ?? 0;
  const rates = latestEurRates(raw.rates);

  const bySymbol = new Map<string, EurPosition>();
  let skippedPositions = 0;
  for (const row of raw.positions) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase().replace(/\s+/g, ".");
    const quantity = num(row.position);
    const value = num(row.positionValue);
    const cost = num(row.costBasisPrice);
    const rate = rates.get(cur(row.currency));
    if (!/^[A-Z0-9.]{1,10}$/.test(symbol) || quantity === null || quantity <= 0 || value === null || value < 0 || cost === null || cost < 0 || rate === undefined) { skippedPositions++; continue; }
    const prev = bySymbol.get(symbol) ?? { symbol, quantity: 0, valueEur: 0, costEur: 0 };
    prev.quantity += quantity;
    prev.valueEur += value * rate;
    prev.costEur += quantity * cost * rate;
    bySymbol.set(symbol, prev);
  }
  const positions = [...bySymbol.values()].map((p) => ({ symbol: p.symbol, quantity: p.quantity, valueEur: round2(p.valueEur), costEur: round2(p.costEur) }));

  let sum = 0;
  let base: number | null = null;
  let skippedCashRows = 0;
  let currencyRows = 0;
  for (const row of raw.cash) {
    const currency = cur(row.currency);
    const amount = num(row.endingCash);
    if (BASE_ROW.test(currency)) { if (amount !== null) base = amount; continue; }
    currencyRows++;
    const rate = rates.get(currency);
    if (amount === null || rate === undefined) { skippedCashRows++; continue; }
    sum += amount * rate;
  }
  const sumComplete = currencyRows > 0 && skippedCashRows === 0;
  let cashEur: number;
  let cashSource: EurPortfolio["warnings"]["cashSource"] = "sum";
  if (sumComplete) {
    cashEur = sum;
    if (base !== null && Math.abs(base - sum) > Math.max(1, Math.abs(sum) * 0.01)) cashSource = "sum-base-mismatch";
  } else if (base !== null) { cashEur = base; cashSource = "base-summary"; }
  else throw new Error("Flex cash missing");
  return { asOf: isoFlexDate(raw.toDate), fromDate: isoFlexDate(raw.fromDate), positions, cashEur: round2(cashEur), nav: { start, end, deposits }, warnings: { skippedPositions, skippedCashRows, cashSource } };
}
