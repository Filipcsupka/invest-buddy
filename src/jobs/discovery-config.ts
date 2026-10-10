/** preScreenTopK names get one bars call each (7 a minute, 800 a day on the Twelve Data free plan) and those under MA200 are dropped before the cut to maxScreenedPerWeek. Set preScreenMa200 false to cut first. Weekly review cap and mechanical shortlist thresholds. Change here before enabling the suspended job. */
export const DISCOVERY = { maxCandidatesPerWeek: 5, maxScreenedPerWeek: 24, preScreenMa200: true, preScreenTopK: 48, maxFeedPages: 20, maxFeedCompanies: 2000, minRevenueGrowthPct: 15, priceMovePct: 15, volumeMultiple: 2.5 } as const;
/** SEC filer CIKs verified from their Form 13F pages. Holdings are quarter-end snapshots, not current trades. */
export const DISCOVERY_MANAGERS = [
  { name: "Berkshire Hathaway", cik: 1067983 },
  { name: "Pershing Square", cik: 1336528 },
] as const;
