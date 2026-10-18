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
