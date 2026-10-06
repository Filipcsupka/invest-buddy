import type { MarketDataProvider } from "../data/providers";
import { parseFlexStatement } from "./flex";
import { toEurPortfolio, type EurPortfolio } from "./eur";

export interface PortfolioSnapshot {
  asOf: string;
  publishOn: string;
  sample: boolean;
  weights: { symbol: string; weightPercent: number }[];
  /** Fixture and legacy shapes only. Live snapshots leave it empty: the page builds the series from portfolio_nav_history. */
  series: { date: string; nav: number; twrPercent: number; benchmark: number }[];
}

function iso(raw: unknown): string {
  const text = String(raw ?? "");
  const date = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Invalid Flex date");
  return date;
}

function number(raw: unknown): number {
  const value = Number(raw);
  if (raw === undefined || raw === "" || !Number.isFinite(value)) throw new Error("Invalid Flex number");
  return value;
}

export function tradingDayAfter(date: string, count = 1): string {
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error("Invalid publication delay");
  const next = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i < count;) {
    next.setUTCDate(next.getUTCDate() + 1);
    if (next.getUTCDay() !== 0 && next.getUTCDay() !== 6) i++;
  }
  return next.toISOString().slice(0, 10);
}

/** The last weekday on or before the date. Used when the statement carries no report date. */
export function lastTradingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Live Flex shape in EUR. The report date falls back to today's trading date when the statement has none. */
export function parseFlexPortfolio(xml: string, today = new Date().toISOString().slice(0, 10)): EurPortfolio & { asOf: string } {
  const eur = toEurPortfolio(parseFlexStatement(xml));
  return { ...eur, asOf: eur.asOf ?? lastTradingDay(today) };
}

/** Live shape: weights only. The series comes from portfolio_nav_history, so no amounts and no benchmark are stored here. */
function normalizeLive(xml: string, delayTradingDays: number): PortfolioSnapshot {
  const eur = parseFlexPortfolio(xml);
  const total = eur.positions.reduce((sum, p) => sum + p.valueEur, 0);
  if (!eur.positions.length || total <= 0) throw new Error("Incomplete Flex statement");
  if (!eur.fromDate || eur.fromDate >= eur.asOf) throw new Error("Flex period too short");
  if (eur.nav.start <= 0) throw new Error("Flex NAV invalid");
  const weights = eur.positions.map((p) => ({ symbol: p.symbol, weightPercent: Number((100 * p.valueEur / total).toFixed(2)) }));
  return { asOf: eur.asOf, publishOn: tradingDayAfter(eur.asOf, delayTradingDays), sample: false, weights, series: [] };
}

export async function normalizeFlex(xml: string, benchmarkProvider: MarketDataProvider, delayTradingDays = 1): Promise<PortfolioSnapshot> {
  const raw = parseFlexStatement(xml);
  if (raw.navSummary) return normalizeLive(xml, delayTradingDays);
  if (!raw.positions.length || !raw.nav.length) throw new Error("Incomplete Flex statement");
  const nav = raw.nav.map((row) => ({ date: iso(row.reportDate ?? row.date), twr: number(row.twr ?? row.TWR) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(nav.map((point) => point.date)).size !== nav.length) throw new Error("Duplicate NAV date");
  const asOf = nav.at(-1)!.date;
  const weights = raw.positions.filter((row) => String(row.symbol ?? "").toUpperCase() !== "CASH")
    .map((row) => ({ symbol: String(row.symbol ?? ""), weightPercent: number(row.weightPercent ?? row.weight) }));
  if (!weights.length || weights.some((row) => !/^[A-Z0-9.\-]+$/.test(row.symbol) || row.weightPercent < 0 || row.weightPercent > 100)) throw new Error("Invalid positions");
  const bars = await benchmarkProvider.bars("SPY");
  const byDate = new Map(bars.map((bar) => [bar.date, bar.close]));
  const first = byDate.get(nav[0].date);
  if (!first || first <= 0) throw new Error("Benchmark missing start date");
  let index = 100;
  const series = nav.map((point, position) => {
    const close = byDate.get(point.date);
    if (!close || close <= 0 || point.twr < -100 || point.twr > 1000) throw new Error("Benchmark or TWR invalid");
    if (position > 0) index *= 1 + point.twr / 100;
    return { date: point.date, nav: Number(index.toFixed(4)), twrPercent: point.twr, benchmark: Number((100 * close / first).toFixed(4)) };
  });
  return { asOf, publishOn: tradingDayAfter(asOf, delayTradingDays), sample: false, weights, series };
}

export function isPublishable(snapshot: PortfolioSnapshot, today = new Date().toISOString().slice(0, 10)): boolean {
  return snapshot.publishOn <= today;
}
