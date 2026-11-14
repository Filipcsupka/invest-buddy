/**
 * Investment themes, finer than the eleven sector groups (S1, docs/shortlist.md). Pure, no data writes.
 *
 * A theme is resolved in this order:
 *   1. a named `instruments.sector` label that fits one theme (AI & semiconductors, Cloud & SaaS, Cybersecurity, Biotech, Fintech,
 *      Energy & EV),
 *   2. the stored vendor industry (`symbols.industry`), from the table below,
 *   3. the sector group, only where the group fits one theme (Healthcare, Energy, Utilities, Industrials, the two consumer groups,
 *      Real Estate and Basic Materials),
 *   4. Unknown.
 * Labels with no theme (Unclassified, Growth, Discovery, Sample extension, Benchmark) are skipped. Technology, Financial Services and
 * Communication Services hold several themes, so a name from those groups with an unmatched industry stays Unknown.
 * "Other" is a known classification outside the named themes (banks, insurance, telecom, real estate, materials); Unknown means no
 * classification was found.
 */
import { SECTOR_GROUPS, sectorGroup, type NamedSectorGroup, type SectorFacts, type SectorGroup } from "./sector-groups";

export const THEMES = [
  "ai-semis", "cloud-software", "cybersecurity", "robotics", "healthcare", "fintech", "energy-ev", "industrials", "consumer", "other",
] as const;
export type NamedTheme = (typeof THEMES)[number];
export const UNKNOWN_THEME = "unknown" as const;
export type Theme = NamedTheme | typeof UNKNOWN_THEME;
export const ALL_THEMES: readonly Theme[] = [...THEMES, UNKNOWN_THEME];
export type ThemeSource = "instrument" | "vendor-industry" | "sector-group" | "none";

const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const table = (entries: [NamedTheme, string[]][]) => new Map(entries.flatMap(([theme, names]) => names.map((name) => [key(name), theme] as const)));

/** Stored thematic `instruments.sector` labels with exactly one theme. */
const BY_INSTRUMENT = table([
  ["ai-semis", ["AI & semiconductors"]],
  ["cloud-software", ["Cloud & SaaS"]],
  ["cybersecurity", ["Cybersecurity"]],
  ["healthcare", ["Biotech"]],
  ["fintech", ["Fintech"]],
  ["energy-ev", ["Energy & EV"]],
]);

/**
 * Vendor industry names (the vocabulary stored in `symbols.industry`). The vendor has no cybersecurity or robotics industry, so
 * cybersecurity comes only from the instrument label, and robotics and automation uses machinery and instrument makers.
 */
const BY_INDUSTRY = table([
  ["ai-semis", ["Semiconductors", "Semiconductor Equipment & Materials", "Computer Hardware", "Electronic Components", "Communication Equipment",
    "Communications & Networking", "Electronics & Computer Distribution"]],
  ["cloud-software", ["Software - Application", "Software - Infrastructure", "Software", "Information Technology Services", "Internet Content & Information"]],
  ["robotics", ["Specialty Industrial Machinery", "Scientific & Technical Instruments"]],
  ["healthcare", ["Biotechnology", "Drug Manufacturers - General", "Drug Manufacturers - Specialty & Generic", "Diagnostics & Research", "Medical Devices",
    "Medical Instruments & Supplies", "Health Information Services", "Healthcare Plans", "Medical Care Facilities", "Medical Distribution", "Pharmaceutical Retailers"]],
  ["fintech", ["Credit Services", "Financial Data & Stock Exchanges"]],
  ["energy-ev", ["Oil & Gas E&P", "Oil & Gas Drilling", "Oil & Gas Equipment & Services", "Oil & Gas Integrated", "Oil & Gas Midstream",
    "Oil & Gas Refining & Marketing", "Uranium", "Thermal Coal", "Coking Coal", "Solar", "Utilities - Regulated Electric", "Utilities - Regulated Gas",
    "Utilities - Renewable", "Utilities - Diversified", "Utilities - Regulated Water", "Utilities - Independent Power Producers"]],
  ["industrials", ["Aerospace & Defense", "Electrical Equipment & Parts", "Engineering & Construction", "Building Products & Equipment", "Railroads",
    "Trucking", "Airlines", "Airports & Air Services", "Marine Shipping", "Integrated Freight & Logistics", "Staffing & Employment Services", "Waste Management",
    "Farm & Heavy Construction Machinery", "Industrial Distribution", "Specialty Business Services", "Conglomerates", "Metal Fabrication", "Tools & Accessories",
    "Security & Protection Services", "Rental & Leasing Services", "Consulting Services", "Pollution & Treatment Controls", "Infrastructure Operations",
    "Business Equipment & Supplies"]],
  ["consumer", ["Auto Manufacturers", "Auto Parts", "Automobiles & Auto Parts", "Auto & Truck Dealerships", "Internet Retail", "Specialty Retail",
    "Home Improvement Retail", "Department Stores", "Restaurants", "Apparel Retail", "Apparel Manufacturing", "Footwear & Accessories", "Luxury Goods", "Leisure",
    "Lodging", "Resorts & Casinos", "Gambling", "Travel Services", "Residential Construction", "Furnishings, Fixtures & Appliances", "Consumer Electronics",
    "Textile Manufacturing", "Personal Services", "Education & Training Services", "Packaged Foods", "Beverages - Non-Alcoholic", "Beverages - Brewers",
    "Beverages - Wineries & Distilleries", "Household & Personal Products", "Discount Stores", "Grocery Stores", "Food Distribution", "Tobacco",
    "Confectioners", "Farm Products", "Entertainment", "Electronic Gaming & Multimedia", "Broadcasting", "Publishing", "Advertising Agencies"]],
  ["other", ["Banks - Regional", "Banks - Diversified", "Asset Management", "Capital Markets", "Insurance - Life", "Insurance - Property & Casualty",
    "Insurance - Diversified", "Insurance - Reinsurance", "Insurance - Specialty", "Insurance Brokers", "Financial Conglomerates", "Mortgage Finance",
    "Telecom Services", "Specialty Chemicals", "Chemicals", "Agricultural Inputs", "Steel", "Gold", "Silver", "Copper", "Aluminum",
    "Other Industrial Metals & Mining", "Other Precious Metals & Mining", "Building Materials", "Lumber & Wood Production", "Paper & Paper Products",
    "Packaging & Containers", "REIT - Diversified", "REIT - Industrial", "REIT - Office", "REIT - Residential", "REIT - Retail", "REIT - Specialty",
    "REIT - Healthcare Facilities", "REIT - Hotel & Motel", "Real Estate Services", "Real Estate - Development", "Real Estate - Diversified"]],
]);

/** Sector groups that fit one theme. The others (Technology, Financial Services, Communication Services) span several. */
const BY_GROUP: Partial<Record<NamedSectorGroup, NamedTheme>> = {
  Healthcare: "healthcare", Energy: "energy-ev", Utilities: "energy-ev", Industrials: "industrials",
  "Consumer Cyclical": "consumer", "Consumer Defensive": "consumer", "Real Estate": "other", "Basic Materials": "other",
};

export const themeFromInstrumentSector = (sector: string | null | undefined): NamedTheme | null => BY_INSTRUMENT.get(key(sector)) ?? null;
export const themeFromIndustry = (industry: string | null | undefined): NamedTheme | null => BY_INDUSTRY.get(key(industry)) ?? null;
export const themeFromGroup = (group: SectorGroup): NamedTheme | null => (group === "Unknown" ? null : BY_GROUP[group] ?? null);

export interface ResolvedTheme { theme: Theme; source: ThemeSource }

/** The theme of one listing and where it came from. Never throws; anything unmatched is Unknown with source `none`. */
export function themeOf(facts: SectorFacts): ResolvedTheme {
  const fromInstrument = themeFromInstrumentSector(facts.instrumentSector);
  if (fromInstrument) return { theme: fromInstrument, source: "instrument" };
  const fromIndustry = themeFromIndustry(facts.vendorIndustry);
  if (fromIndustry) return { theme: fromIndustry, source: "vendor-industry" };
  const fromGroup = themeFromGroup(sectorGroup(facts).group);
  if (fromGroup) return { theme: fromGroup, source: "sector-group" };
  return { theme: UNKNOWN_THEME, source: "none" };
}

export const isTheme = (value: string): value is Theme => (ALL_THEMES as readonly string[]).includes(value);
/** Every sector group has a theme rule or is listed as spanning several; kept for the tests. */
export const MULTI_THEME_GROUPS: readonly NamedSectorGroup[] = SECTOR_GROUPS.filter((group) => !BY_GROUP[group]);
