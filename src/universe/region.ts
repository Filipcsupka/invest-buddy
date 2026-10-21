import type pg from "pg";
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

/**
 * Region of an instrument. A non-US key suffix (SAP.XETRA) wins, because universe_membership.exchange defaults to 'US' and a name
 * approved before symbols:sync keeps that default. Otherwise a non-US listing exchange decides (a bare key such as ASML on AS).
 * Keys without either are US listings.
 */
export const instrumentRegion = (ticker: string, exchange?: string | null): Region => regionForExchange(suffixExchange(ticker) ?? exchange);

/**
 * Region per ticker on asOf, shared by the macro and price jobs. The listing exchange is the first non-US one of the as-of membership
 * row and the stored symbols row; a 'US' membership never overrides a non-US key suffix (instrumentRegion).
 */
export async function loadRegions(pool: Pick<pg.Pool, "query">, asOf: string, tickers: string[]): Promise<Map<string, Region>> {
  const rows = await pool.query<{ ticker: string; membership: string | null; listing: string | null }>(`SELECT t.ticker,
      (SELECT m.exchange FROM universe_membership m WHERE m.ticker=t.ticker AND m.valid_from <= $2::date AND (m.valid_to IS NULL OR m.valid_to > $2::date)
        ORDER BY m.valid_from DESC LIMIT 1) AS membership,
      (SELECT s.exchange FROM symbols s WHERE s.vendor_symbol=t.ticker AND s.exchange<>'US' LIMIT 1) AS listing
    FROM unnest($1::text[]) AS t(ticker)`, [tickers, asOf]);
  const exchange = new Map(rows.rows.map((row) => [row.ticker, [row.membership, row.listing].find((item) => item && item !== "US") ?? null]));
  return new Map(tickers.map((ticker) => [ticker, instrumentRegion(ticker, exchange.get(ticker))]));
}
