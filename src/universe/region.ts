import { isUniverseExchange, suffixExchange } from "./market";

/** Regions for the macro inputs. Every supported non-US exchange is European. */
export const REGIONS = ["US", "Europe"] as const;
export type Region = typeof REGIONS[number];

/**
 * Price benchmark per region, as an instrument key in daily_bars. SPY stays the US benchmark. EXSA.XETRA is the iShares STOXX Europe 600
 * UCITS ETF (DE), quoted in EUR on XETRA (migration 101 seeds it). UNVERIFIED: that EODHD lists EXSA on XETRA with full history.
 */
export const REGION_BENCHMARKS: Record<Region, string> = { US: "SPY", Europe: "EXSA.XETRA" };

export const regionForExchange = (exchange: string | null | undefined): Region =>
  exchange && exchange !== "US" && isUniverseExchange(exchange) ? "Europe" : "US";

/** Region of an instrument from its membership exchange, else its key suffix (SAP.XETRA). Legacy rows without either are US listings. */
export const instrumentRegion = (ticker: string, exchange?: string | null): Region => regionForExchange(exchange ?? suffixExchange(ticker));
