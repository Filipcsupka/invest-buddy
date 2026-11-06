export const ETF_TABS = ["overview", "holdings", "exposure", "performance", "dividends"] as const;
export type EtfTab = (typeof ETF_TABS)[number];
export const isEtfTab = (value: string): value is EtfTab => (ETF_TABS as readonly string[]).includes(value);

/** `/{locale}/etf/fund/{key}/{tab}`: owner-only vendor data, gated like the market sections. */
export function isEtfDataPath(pathname: string): boolean {
  return /^\/(en|sk)\/etf\/fund\/[^/]+\/[^/]+\/?$/.test(pathname);
}
export const etfTabHref = (locale: string, listingKey: string, tab: EtfTab) => `/${locale}/etf/fund/${encodeURIComponent(listingKey)}/${tab}`;
