export type IndexRegion = "americas" | "europe" | "asiaPacific" | "other";

export function indexRegion(code: string, country: string | null): IndexRegion {
  const c = (country ?? "").toLowerCase();
  if (/united states|canada|brazil|mexico|argentina/.test(c)) return "americas";
  if (/japan|china|hong kong|india|taiwan|korea|australia/.test(c)) return "asiaPacific";
  if (/germany|france|netherlands|switzerland|spain|united kingdom|europe/.test(c)) return "europe";
  if (["GSPC", "NDX", "DJI", "DJT", "DJU", "IXIC", "VIX", "GSPTSE", "BVSP", "MXX"].includes(code)) return "americas";
  if (["GDAXI", "FCHI", "STOXX50E", "AEX", "IBEX", "SSMI", "N100"].includes(code)) return "europe";
  if (["N225", "AXJO", "BSESN", "HSI", "KS11", "NSEI", "SSEC", "TWII"].includes(code)) return "asiaPacific";
  return "other";
}
