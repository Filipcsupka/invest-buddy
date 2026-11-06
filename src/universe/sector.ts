/** Sector names used by the stored universe. SIC codes without a clear match stay `Unclassified`. */
export const UNCLASSIFIED = "Unclassified";

const BY_SIC: [string, number[]][] = [
  ["Biotech", [2833, 2834, 2835, 2836, 8731]],
  ["AI & semiconductors", [3559, 3571, 3572, 3576, 3674, 3825]],
  ["Cloud & SaaS", [7370, 7371, 7372, 7373, 7374]],
  ["Fintech", [6099, 6141, 6153, 6159, 6199]],
  ["Energy & EV", [1311, 1381, 1382, 1389, 2911, 3620, 3621, 3690, 3711, 4610, 4911, 4922, 4923, 4924, 4991, 5171, 5172]],
];
const SIC_SECTOR = new Map(BY_SIC.flatMap(([sector, codes]) => codes.map((code) => [code, sector] as const)));

/** Maps an SEC SIC code to an existing sector name; unknown or missing codes give `Unclassified`. */
export function sectorFromSic(sic: number | null | undefined): string {
  return sic === null || sic === undefined ? UNCLASSIFIED : SIC_SECTOR.get(sic) ?? UNCLASSIFIED;
}

/**
 * EODHD `General.Industry` names that match the SIC groups above, compared case-insensitively. UNVERIFIED: the industry vocabulary is
 * taken from EODHD sample responses, not a published list; an unmatched or missing industry stays `Unclassified`. No model fills it.
 */
const BY_EODHD_INDUSTRY: [string, string[]][] = [
  ["Biotech", ["Biotechnology", "Drug Manufacturers - General", "Drug Manufacturers - Specialty & Generic", "Diagnostics & Research"]],
  ["AI & semiconductors", ["Semiconductors", "Semiconductor Equipment & Materials", "Computer Hardware"]],
  ["Cloud & SaaS", ["Software - Application", "Software - Infrastructure", "Information Technology Services"]],
  ["Fintech", ["Credit Services"]],
  ["Energy & EV", ["Auto Manufacturers", "Solar", "Oil & Gas E&P", "Oil & Gas Drilling", "Oil & Gas Equipment & Services", "Oil & Gas Integrated",
    "Oil & Gas Midstream", "Oil & Gas Refining & Marketing", "Utilities - Regulated Electric", "Utilities - Regulated Gas", "Utilities - Renewable",
    "Utilities - Diversified", "Electrical Equipment & Parts"]],
];
const EODHD_INDUSTRY_SECTOR = new Map(BY_EODHD_INDUSTRY.flatMap(([sector, names]) => names.map((name) => [name.toLowerCase(), sector] as const)));

/** Maps an EODHD industry to an existing sector name. The vendor sector alone is too broad (Technology covers both chips and software). */
export function sectorFromEodhd(industry: string | null | undefined): string {
  return industry ? EODHD_INDUSTRY_SECTOR.get(industry.trim().toLowerCase()) ?? UNCLASSIFIED : UNCLASSIFIED;
}

/** Trimmed General.Sector and General.Industry from an EODHD fundamentals payload; blank or non-string values are null. */
export function eodhdClassification(general: { Sector?: unknown; Industry?: unknown } | undefined): { sector: string | null; industry: string | null } {
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
  return { sector: text(general?.Sector), industry: text(general?.Industry) };
}
