export const ETF_RULES_VERSION = "etf-v1-2026-11-12";
export const ETF_MAX_POINTS = 35;
export const ETF_MIN_EVIDENCED = 28;
export const ETF_SCORE_BANDS = {
  ter: [[0.10, 10], [0.20, 8], [0.30, 6], [0.50, 4], [0.75, 2]] as const,
  aum: [[1_000_000_000, 6], [500_000_000, 5], [100_000_000, 3], [50_000_000, 1]] as const,
  liquidity: [[1_000_000, 4], [100_000, 2]] as const,
  age: [[5, 3], [3, 2], [1, 1]] as const,
  smaBand: 0.02,
  maxEquityDrawdown: -0.20,
  topTenConcentration: 50,
  countryConcentration: 70,
} as const;
