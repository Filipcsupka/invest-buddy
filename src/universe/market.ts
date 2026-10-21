import { ECB_SERIES } from "../collectors/ecb-fx";

/** Single list of supported listing exchanges. migrations/099_universe_exchange.sql repeats it in a CHECK; market.test.ts keeps the two equal. */
export const UNIVERSE_EXCHANGES = ["US", "XETRA", "LSE", "PA", "AS", "SW", "PR", "WAR", "MI", "MC", "ST", "OL", "CO", "HE", "VI", "BR", "LS"] as const;
export type UniverseExchange = typeof UNIVERSE_EXCHANGES[number];
export const UNIVERSE_CURRENCIES = ["USD", "EUR", "GBP", "GBX", "CHF", "PLN", "SEK", "NOK", "DKK", "CZK"] as const;

/** An ECB reference rate can be at most this many calendar days older than the score date. */
export const FX_MAX_AGE_DAYS = 5;

export type FxObservation = { value: number; date: string };
export type FxResult = { usdPerUnit: number; reason: null } | { usdPerUnit: null; reason: "fx_unavailable" | "fx_stale" };

export const isUniverseExchange = (exchange: string): exchange is UniverseExchange => UNIVERSE_EXCHANGES.some((item) => item === exchange);

export function marketIdentity(ticker: string, exchange = "US"): string {
  const suffix = `.${exchange}`;
  return `${exchange}:${ticker.endsWith(suffix) ? ticker.slice(0, -suffix.length) : ticker}`;
}

/** Non-US exchange named by an instrument key suffix (SAP.XETRA), or null. US keys such as BRK.B never match. */
export function suffixExchange(ticker: string): UniverseExchange | null {
  const suffix = ticker.includes(".") ? ticker.slice(ticker.lastIndexOf(".") + 1) : "";
  return suffix !== "US" && isUniverseExchange(suffix) ? suffix : null;
}

/** Upper-cases a stored currency. `GBp` is the common pence marker, so it maps to GBX instead of GBP. */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw === "GBp" || raw.toUpperCase() === "GBX" ? "GBX" : raw.toUpperCase();
}

const DAY = 86_400_000;
const ageDays = (date: string, asOf: string) => (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY;

/**
 * USD per unit of the quote currency from ECB rates (units of a currency per euro) known by asOf. Missing rates never become 1:1.
 * Each series must be at most FX_MAX_AGE_DAYS old, and a cross rate needs both series from the same ECB publication date.
 */
export function fxConversion(currency: string, rates: ReadonlyMap<string, FxObservation>, asOf: string): FxResult {
  if (currency === "USD") return { usdPerUnit: 1, reason: null };
  if (!UNIVERSE_CURRENCIES.some((item) => item === currency)) return { usdPerUnit: null, reason: "fx_unavailable" };
  const usd = rates.get(ECB_SERIES.USD);
  const local = currency === "EUR" ? null : rates.get(ECB_SERIES[currency === "GBX" ? "GBP" : currency]);
  if (!usd || !(usd.value > 0) || (currency !== "EUR" && (!local || !(local.value > 0)))) return { usdPerUnit: null, reason: "fx_unavailable" };
  const used = local ? [usd, local] : [usd];
  if (used.some((rate) => ageDays(rate.date, asOf) > FX_MAX_AGE_DAYS || ageDays(rate.date, asOf) < 0)) return { usdPerUnit: null, reason: "fx_stale" };
  if (local && local.date !== usd.date) return { usdPerUnit: null, reason: "fx_stale" };
  return { usdPerUnit: usd.value / (local?.value ?? 1) / (currency === "GBX" ? 100 : 1), reason: null };
}

/**
 * Known USD conversion for a candidate row, or null. Rows without exchange and currency predate the market-aware read model and
 * are US dollar listings. An empty or unknown currency never becomes 1.
 */
export function knownUsdPerUnit(row: { usdPerUnit?: number | null; currency?: string; exchange?: string }): number | null {
  if (typeof row.usdPerUnit === "number") return Number.isFinite(row.usdPerUnit) && row.usdPerUnit > 0 ? row.usdPerUnit : null;
  if (row.currency === "USD") return 1;
  return row.currency === undefined && (row.exchange ?? "US") === "US" ? 1 : null;
}
