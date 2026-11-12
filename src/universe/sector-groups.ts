/**
 * Sector groups for concentration views (N2, docs/shortlist.md). Pure, no data writes.
 *
 * Eleven sectors in the Morningstar style (the same eleven names the market data vendor uses in its fundamentals `General.Sector`)
 * plus an explicit Unknown bucket. The stored `instruments.sector` is a thematic label (Biotech, Cloud & SaaS, Growth...) and is
 * often Unclassified, so a group is resolved in this order:
 *   1. a named `instruments.sector` that maps to exactly one group,
 *   2. the stored vendor sector (`symbols.sector`),
 *   3. the stored vendor industry (`symbols.industry`),
 *   4. Unknown.
 * A thematic label that spans several groups (Energy & EV, Growth, Additional growth) is not used.
 */
export const SECTOR_GROUPS = [
  "Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Consumer Defensive", "Industrials",
  "Communication Services", "Energy", "Basic Materials", "Real Estate", "Utilities",
] as const;
export type NamedSectorGroup = (typeof SECTOR_GROUPS)[number];
export const UNKNOWN_SECTOR = "Unknown" as const;
export type SectorGroup = NamedSectorGroup | typeof UNKNOWN_SECTOR;
export const ALL_SECTOR_GROUPS: readonly SectorGroup[] = [...SECTOR_GROUPS, UNKNOWN_SECTOR];

export type SectorSource = "instrument" | "vendor-sector" | "vendor-industry" | "none";

const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const table = (entries: [NamedSectorGroup, string[]][]) => new Map(entries.flatMap(([group, names]) => names.map((name) => [key(name), group] as const)));

/** Stored thematic `instruments.sector` labels that sit inside one group. Unclassified and multi-group labels are absent on purpose. */
const BY_INSTRUMENT = table([
  ["Technology", ["AI & semiconductors", "Cloud & SaaS", "Cybersecurity"]],
  ["Healthcare", ["Biotech"]],
  ["Financial Services", ["Fintech"]],
]);

/** Vendor sector names, plus the GICS spellings, matched case-insensitively. */
const BY_VENDOR_SECTOR = table([
  ["Technology", ["Technology", "Information Technology", "Tech"]],
  ["Healthcare", ["Healthcare", "Health Care"]],
  ["Financial Services", ["Financial Services", "Financials", "Financial"]],
  ["Consumer Cyclical", ["Consumer Cyclical", "Consumer Discretionary"]],
  ["Consumer Defensive", ["Consumer Defensive", "Consumer Staples"]],
  ["Industrials", ["Industrials", "Industrial"]],
  ["Communication Services", ["Communication Services", "Communications", "Telecommunication Services", "Telecommunications"]],
  ["Energy", ["Energy"]],
  ["Basic Materials", ["Basic Materials", "Materials"]],
  ["Real Estate", ["Real Estate"]],
  ["Utilities", ["Utilities"]],
]);

/**
 * Vendor industry names for rows with no vendor sector. The list covers the industries named in src/universe/sector.ts and the common
 * ones of the same vocabulary; an unmatched industry stays Unknown.
 */
const BY_VENDOR_INDUSTRY = table([
  ["Technology", ["Semiconductors", "Semiconductor Equipment & Materials", "Computer Hardware", "Software - Application", "Software - Infrastructure",
    "Information Technology Services", "Electronic Components", "Scientific & Technical Instruments", "Communication Equipment", "Consumer Electronics",
    "Electronics & Computer Distribution", "Solar"]],
  ["Healthcare", ["Biotechnology", "Drug Manufacturers - General", "Drug Manufacturers - Specialty & Generic", "Diagnostics & Research",
    "Medical Devices", "Medical Instruments & Supplies", "Health Information Services", "Healthcare Plans", "Medical Care Facilities", "Medical Distribution"]],
  ["Financial Services", ["Credit Services", "Banks - Regional", "Banks - Diversified", "Asset Management", "Capital Markets", "Insurance - Life",
    "Insurance - Property & Casualty", "Insurance - Diversified", "Insurance Brokers", "Financial Data & Stock Exchanges"]],
  ["Consumer Cyclical", ["Auto Manufacturers", "Auto Parts", "Internet Retail", "Specialty Retail", "Restaurants", "Apparel Retail", "Leisure",
    "Travel Services", "Residential Construction", "Gambling"]],
  ["Consumer Defensive", ["Packaged Foods", "Beverages - Non-Alcoholic", "Beverages - Brewers", "Household & Personal Products", "Discount Stores",
    "Grocery Stores", "Tobacco", "Confectioners"]],
  ["Industrials", ["Aerospace & Defense", "Specialty Industrial Machinery", "Electrical Equipment & Parts", "Engineering & Construction",
    "Building Products & Equipment", "Railroads", "Trucking", "Airlines", "Integrated Freight & Logistics", "Staffing & Employment Services",
    "Waste Management", "Farm & Heavy Construction Machinery", "Industrial Distribution", "Specialty Business Services"]],
  ["Communication Services", ["Internet Content & Information", "Telecom Services", "Entertainment", "Electronic Gaming & Multimedia",
    "Advertising Agencies", "Broadcasting", "Publishing"]],
  ["Energy", ["Oil & Gas E&P", "Oil & Gas Drilling", "Oil & Gas Equipment & Services", "Oil & Gas Integrated", "Oil & Gas Midstream",
    "Oil & Gas Refining & Marketing", "Uranium", "Thermal Coal"]],
  ["Basic Materials", ["Gold", "Copper", "Steel", "Specialty Chemicals", "Chemicals", "Agricultural Inputs", "Other Industrial Metals & Mining",
    "Building Materials", "Aluminum", "Silver", "Lumber & Wood Production"]],
  ["Real Estate", ["REIT - Diversified", "REIT - Industrial", "REIT - Office", "REIT - Residential", "REIT - Retail", "REIT - Specialty",
    "REIT - Healthcare Facilities", "Real Estate Services", "Real Estate - Development"]],
  ["Utilities", ["Utilities - Regulated Electric", "Utilities - Regulated Gas", "Utilities - Renewable", "Utilities - Diversified",
    "Utilities - Regulated Water", "Utilities - Independent Power Producers"]],
]);

export const groupFromInstrumentSector = (sector: string | null | undefined): NamedSectorGroup | null => BY_INSTRUMENT.get(key(sector)) ?? null;
export const groupFromVendorSector = (sector: string | null | undefined): NamedSectorGroup | null => BY_VENDOR_SECTOR.get(key(sector)) ?? null;
export const groupFromVendorIndustry = (industry: string | null | undefined): NamedSectorGroup | null => BY_VENDOR_INDUSTRY.get(key(industry)) ?? null;

export interface SectorFacts { instrumentSector?: string | null; vendorSector?: string | null; vendorIndustry?: string | null }
export interface ResolvedSector { group: SectorGroup; source: SectorSource }

/** The group of one listing and where it came from. Never throws; anything unmatched is Unknown with source `none`. */
export function sectorGroup(facts: SectorFacts): ResolvedSector {
  const fromInstrument = groupFromInstrumentSector(facts.instrumentSector);
  if (fromInstrument) return { group: fromInstrument, source: "instrument" };
  const fromSector = groupFromVendorSector(facts.vendorSector);
  if (fromSector) return { group: fromSector, source: "vendor-sector" };
  const fromIndustry = groupFromVendorIndustry(facts.vendorIndustry);
  if (fromIndustry) return { group: fromIndustry, source: "vendor-industry" };
  return { group: UNKNOWN_SECTOR, source: "none" };
}

export const isSectorGroup = (value: string): value is SectorGroup => (ALL_SECTOR_GROUPS as readonly string[]).includes(value);
