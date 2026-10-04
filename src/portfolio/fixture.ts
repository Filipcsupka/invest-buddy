import type { PortfolioSnapshot } from "./model";

export const samplePortfolio: PortfolioSnapshot = {
  asOf: "2025-08-08",
  publishOn: "2025-08-11",
  sample: true,
  weights: [
    { symbol: "NVDA", weightPercent: 34 },
    { symbol: "MSFT", weightPercent: 28 },
    { symbol: "AMZN", weightPercent: 22 },
    { symbol: "GOOGL", weightPercent: 16 },
  ],
  series: [
    { date: "2025-08-04", nav: 100, twrPercent: 0, benchmark: 100 },
    { date: "2025-08-05", nav: 101.2, twrPercent: 1.2, benchmark: 100.7 },
    { date: "2025-08-06", nav: 100.8, twrPercent: -0.395, benchmark: 100.4 },
    { date: "2025-08-07", nav: 102.1, twrPercent: 1.29, benchmark: 101.1 },
    { date: "2025-08-08", nav: 102.6, twrPercent: 0.49, benchmark: 101.5 },
  ],
};
