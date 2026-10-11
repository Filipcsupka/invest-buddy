/**
 * Weekly review cap and mechanical shortlist thresholds. Change here before enabling the suspended job.
 * preScreenTopK names get one bars call each (7 a minute, 800 a day on the Twelve Data free plan; discovery may use 700, see D8 in src/data/usage.ts) and those under MA200 or below the quality floor are dropped before the cut to maxScreenedPerWeek. Set preScreenMa200 false to cut first.
 * Quality floor (DS1): minMarketCapUsd is last close times SEC shares outstanding; minAvgDollarVolumeUsd is the mean of close times volume over the last avgDollarVolumeDays bars. A name with no share count has no market cap and is not passed.
 * excludedSic: 6770 blank check (SPAC), 6726 unit investment trusts. Name rules for LPs, cooperatives, SPACs, ADRs and non-common securities live in discovery-quality.ts.
 */
export const DISCOVERY = { maxCandidatesPerWeek: 10, maxScreenedPerWeek: 30, preScreenMa200: true, preScreenTopK: 60, maxFeedPages: 20, maxFeedCompanies: 2000, minRevenueGrowthPct: 15, priceMovePct: 15, volumeMultiple: 2.5,
  minMarketCapUsd: 300_000_000, minAvgDollarVolumeUsd: 2_000_000, avgDollarVolumeDays: 20, excludedSic: ["6770", "6726"] } as const;
/** SEC filer CIKs verified from their Form 13F pages. Holdings are quarter-end snapshots, not current trades. */
export const DISCOVERY_MANAGERS = [
  { name: "Berkshire Hathaway", cik: 1067983 },
  { name: "Pershing Square", cik: 1336528 },
] as const;
