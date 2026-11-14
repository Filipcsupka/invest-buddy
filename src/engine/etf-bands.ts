/** Neutral labels for the published ETF screening percentage. */
export type EtfBand = "rulesMet" | "mostlyMet" | "partlyMet" | "fewMet";
export function etfBand(percent: number, evidencedMax: number): { band: EtfBand; incompleteData: boolean } {
  const band: EtfBand = percent >= 72 ? "rulesMet" : percent >= 60 ? "mostlyMet" : percent >= 48 ? "partlyMet" : "fewMet";
  const incompleteData = evidencedMax < 70;
  return { band: incompleteData && band === "rulesMet" ? "mostlyMet" : band, incompleteData };
}
