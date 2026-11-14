export interface EodhdEnrichRow {
  listingKey: string; isin?: string | null; name?: string | null; symbol?: string | null; exchange?: string | null;
  vendorSymbol?: string | null; ucitsHint?: boolean | null; dividendHistory?: { value?: unknown; amount?: unknown }[] | null;
}
export interface EodhdEnrichment {
  listingKey: string; isin: string | null; issuer: string | null;
  assetClass: "equity" | "bond" | "commodity" | "multi_asset" | "money_market" | "other" | null;
  region: string | null; theme: null; trackedIndex: string | null; terPct: number | null; aumUsdM: number | null;
  domicile: string | null; replication: null; distribution: "acc" | "dist" | null; ucits: null;
  ucitsHint: boolean | null; terGap: "ter_ambiguous" | null; sourceUrl: string | null; source: "eodhd"; holdingsCount: number | null;
}
export function vendorSymbol(row: EodhdEnrichRow): string | null;
export function normalizeEtfRegion(value: unknown): string | null;
export function mapFundamentals(row: EodhdEnrichRow, symbol: string | null, data: unknown): EodhdEnrichment;
