/** Owner-adjustable research defaults. Caps and the kill switch are enforced by RS5. */
export const RESEARCH_CONFIG = {
  dailyWatchCap: 25,
  movePercent: 7,
  volumeMultiple20d: 2.5,
  earningsLookbackDays: 2,
  knownFactsDays: 90,
  calls: {
    weekly: { maxTurns: 30, maxSearches: 40, maxFetches: 60, maxFindings: 40, timeoutS: 1500 },
    daily: { maxTurns: 30, maxSearches: 40, maxFetches: 60, maxFindings: 40, timeoutS: 1500 },
    deepdive: { maxTurns: 30, maxSearches: 40, maxFetches: 60, maxFindings: 40, timeoutS: 1500 },
  },
} as const;
