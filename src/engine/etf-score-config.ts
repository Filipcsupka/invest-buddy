export const ETF_RULES_VERSION = "etf-v3-2026-11-13";
export const ETF_MAX_POINTS = 100;
export const ETF_SCORE_BANDS = {
  ter: [[0.10, 12], [0.20, 10], [0.30, 8], [0.50, 5], [0.75, 2]] as const,
  peer: [[25, 8], [50, 5], [75, 2]] as const,
  aum: [[1_000_000_000, 8], [500_000_000, 6], [250_000_000, 4], [100_000_000, 3], [50_000_000, 1]] as const,
  liquidity: [[5_000_000, 8], [1_000_000, 6], [250_000, 4], [100_000, 2]] as const,
  age: [[5, 4], [3, 3], [1, 1]] as const,
  smaBand: 0.02,
  topTenConcentration: 50,
  countryConcentration: 70,
} as const;
