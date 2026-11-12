import type pg from "pg";
import { sectorGroup, type ResolvedSector } from "@/universe/sector-groups";

type Query = Pick<pg.Pool, "query">;

/** Stored classification and quote currency of one listing. Every field may be missing. */
export interface ListingFacts { ticker: string; instrumentSector: string | null; vendorSector: string | null; vendorIndustry: string | null; currency: string | null }

/**
 * Read model for sector groups (N2). One batched read of `instruments` joined to the newest matching `symbols` row, using the same
 * symbol match as the universe candidates (src/universe/candidates.ts). Read only: it writes nothing and runs no backfill.
 * The vendor sector is taken only when it was observed on or before `asOf`, so a replay never sees a later classification.
 */
export async function readListingFacts(db: Query, tickers: readonly string[], asOf: string): Promise<Map<string, ListingFacts>> {
  const symbols = [...new Set(tickers.map((t) => t.toUpperCase()))].sort();
  if (!symbols.length) return new Map();
  const result = await db.query<{ ticker: string; instrument_sector: string | null; vendor_sector: string | null; vendor_industry: string | null; currency: string | null }>(
    `SELECT i.ticker, i.sector AS instrument_sector, s.sector AS vendor_sector, s.industry AS vendor_industry, s.currency
       FROM instruments i
       LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_from<=$2::date AND (ids.valid_to IS NULL OR ids.valid_to>$2::date)
       LEFT JOIN LATERAL (
         SELECT CASE WHEN s.sector_observed_on<=$2::date THEN s.sector END AS sector,
                CASE WHEN s.sector_observed_on<=$2::date THEN s.industry END AS industry, s.currency
           FROM symbols s
          WHERE s.vendor_symbol=ids.vendor_symbols->>'eodhd' OR s.vendor_symbol=i.ticker OR (s.exchange='US' AND s.code=i.ticker)
          ORDER BY CASE WHEN s.vendor_symbol=ids.vendor_symbols->>'eodhd' THEN 0 WHEN s.exchange='US' AND s.code=i.ticker THEN 1 ELSE 2 END, s.vendor_symbol
          LIMIT 1) s ON true
      WHERE i.ticker = ANY($1::text[])`, [symbols, asOf]);
  return new Map(result.rows.map((row) => [row.ticker, {
    ticker: row.ticker, instrumentSector: row.instrument_sector, vendorSector: row.vendor_sector, vendorIndustry: row.vendor_industry, currency: row.currency,
  }]));
}

/** Group per ticker. A ticker with no stored facts is Unknown. */
export function sectorGroupsFor(tickers: readonly string[], facts: ReadonlyMap<string, Pick<ListingFacts, "instrumentSector" | "vendorSector" | "vendorIndustry">>, fallbackSector: (ticker: string) => string | null = () => null): Map<string, ResolvedSector> {
  return new Map(tickers.map((ticker) => {
    const row = facts.get(ticker.toUpperCase());
    return [ticker, sectorGroup({ instrumentSector: row?.instrumentSector ?? fallbackSector(ticker), vendorSector: row?.vendorSector, vendorIndustry: row?.vendorIndustry })];
  }));
}
