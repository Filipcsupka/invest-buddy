import { notFound } from "next/navigation";
import { flags } from "@/config/flags";
import { getViewer } from "@/viewer/get-viewer";
import { hasActivePlan, hasPassivePlan, isOwner, vendorLicensed, type Viewer } from "@/viewer/viewer";

/**
 * Market sections the Passive investor path opens: indices, the economy page, the calendar and the ETF fund tabs. The other market
 * sections (screener, congress, news, insiders) carry stock data and stay on the Active path.
 */
export const FUND_MARKET_SECTIONS = ["indices", "economy", "calendar", "etf"] as const;
export type MarketSection = (typeof FUND_MARKET_SECTIONS)[number] | "stocks";
const fundSections = new Set<string>(FUND_MARKET_SECTIONS);

/** The access area of a market URL section; anything unknown counts as stock data. */
export const marketSection = (section: string | undefined): MarketSection => (section && fundSections.has(section) ? section as MarketSection : "stocks");

/**
 * Market data access. The owner and Active customers (Plus or trial) see every market section. A Passive customer sees the fund
 * sections. A free account sees indices, economy and calendar only once a vendor display licence is in place
 * (VENDOR_DISPLAY_LICENSE=on and EODHD_PRIVATE_USE off); the ETF fund tabs stay paid (Passive or Active, as canOpenFunds), licence or
 * not. The default section is "stocks", the strictest.
 */
export function marketsViewable(viewer: Viewer, env: Record<string, string | undefined> = process.env, section: MarketSection = "stocks"): boolean {
  if (!flags(env).MARKETS_VIEWS || viewer.preview) return false;
  if (isOwner(viewer) || hasActivePlan(viewer)) return true;
  if (section === "stocks") return false;
  if (hasPassivePlan(viewer)) return true;
  return section !== "etf" && Boolean(viewer.userId && vendorLicensed(env));
}

export async function assertViewable(source = "eodhd", section: MarketSection = "stocks"): Promise<void> {
  // Source is accepted for collector-specific page loaders.
  if (source.length === 0 || !marketsViewable(await getViewer(), process.env, section)) notFound();
}
