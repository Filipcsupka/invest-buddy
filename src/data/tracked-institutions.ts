/**
 * 13F filers whose quarterly changes feed the institutional side of the accumulation rule (D22).
 * CIKs checked against SEC submissions on 2026-10-11. Index giants (Vanguard, BlackRock) are left out on purpose: their changes follow fund flows, not conviction.
 * Starting list for owner review; adding a filer needs no code change elsewhere.
 */
export interface TrackedInstitution { cik: number; name: string }
export const TRACKED_INSTITUTIONS: readonly TrackedInstitution[] = [
  { cik: 1067983, name: "Berkshire Hathaway" },
  { cik: 1350694, name: "Bridgewater Associates" },
  { cik: 1037389, name: "Renaissance Technologies" },
  { cik: 1423053, name: "Citadel Advisors" },
  { cik: 1179392, name: "Two Sigma Investments" },
  { cik: 1029160, name: "Soros Fund Management" },
  { cik: 1336528, name: "Pershing Square Capital Management" },
  { cik: 1167483, name: "Tiger Global Management" },
  { cik: 1135730, name: "Coatue Management" },
  { cik: 1656456, name: "Appaloosa" },
  { cik: 1040273, name: "Third Point" },
  { cik: 1603466, name: "Point72 Asset Management" },
  { cik: 1061768, name: "Baupost Group" },
  { cik: 315066, name: "FMR (Fidelity)" },
];
