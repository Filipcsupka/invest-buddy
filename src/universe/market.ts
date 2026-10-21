import { ECB_SERIES } from "../collectors/ecb-fx";

export const UNIVERSE_EXCHANGES = ["US", "XETRA", "LSE", "PA", "AS", "SW", "PR", "WAR", "MI", "MC", "ST", "OL", "CO", "HE", "VI", "BR", "LS"] as const;
export const UNIVERSE_CURRENCIES = ["USD", "EUR", "GBP", "GBX", "CHF", "PLN", "SEK", "NOK", "DKK", "CZK"] as const;

export function marketIdentity(ticker: string, exchange = "US"): string {
  const suffix = `.${exchange}`;
  return `${exchange}:${ticker.endsWith(suffix) ? ticker.slice(0, -suffix.length) : ticker}`;
}

/** ECB quotes units of a currency for one euro. Missing or future rates never become an implicit 1:1 conversion. */
export function usdPerUnit(currency: string, rates: ReadonlyMap<string, number>): number | null {
  if (currency === "USD") return 1;
  if (!UNIVERSE_CURRENCIES.some((item) => item === currency)) return null;
  const usd = rates.get(ECB_SERIES.USD);
  const local = currency === "EUR" ? 1 : rates.get(ECB_SERIES[currency === "GBX" ? "GBP" : currency]);
  return usd && local && usd > 0 && local > 0 ? usd / local / (currency === "GBX" ? 100 : 1) : null;
}
