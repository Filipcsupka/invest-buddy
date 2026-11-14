/** Routes that can render stored scores, prices, or other vendor-derived observations. */
export const PRIVATE_DATA_SECTIONS = ["dashboard", "scanner", "stocks", "company", "ideas", "etf", "heatmap", "insiders", "portfolio", "track-record", "owner-allocation"] as const;

/** Private-data sections with fund data only. The Passive plan opens them (canUseFundData); every other section needs stock access. */
export const FUND_DATA_SECTIONS = ["etf"] as const;

/**
 * Private-data sections that every visitor may open because the page itself withholds its vendor content (canSeeStockData). The
 * dashboard shows the investor paths to everyone and the stock board only to viewers with stock access.
 */
export const PAGE_GATED_SECTIONS = ["dashboard"] as const;
