import { XMLParser } from "fast-xml-parser";
import { plainText, type CollectedDocument } from "./types";
import { LICENSES, sourceDocument } from "./sources/common";
import { getText } from "./http";

export const GLOBE_NEWSWIRE_FEED = "https://www.globenewswire.com/rssfeed";
export interface Company { symbol: string; name: string }
const ambiguousTickers = new Set(["NOW", "NET", "SE", "SHOP", "SNOW", "META"]);
const ambiguousNames: Record<string, RegExp> = {
  SE: /\bSea\s+(?:Limited|Ltd\.?|Group)\b/i,
  SQ: /\bBlock\s*,?\s*Inc\.?\b/i,
};
export function parseRss(xml: string, companies: Company[], since: string): CollectedDocument[] {
  const channel = new XMLParser({ ignoreAttributes: false }).parse(xml).rss?.channel;
  const items = channel?.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  const out: CollectedDocument[] = [];
  for (const item of items) {
    const title = plainText(String(item.title ?? ""), 4096);
    const summary = plainText(String(item.description ?? ""), 16384);
    const link = String(item.link ?? "");
    const publishedAt = new Date(String(item.pubDate ?? ""));
    if (!Number.isFinite(publishedAt.getTime()) || publishedAt.toISOString().slice(0, 10) < since || !link.startsWith("https://")) continue;
    const haystack = `${title} ${summary}`;
    const matches: string[] = [];
    for (const company of companies) {
      const ticker = company.symbol;
      const marketTicker = new RegExp(`(?:\\b(?:NASDAQ|NYSE|AMEX|OTC)\\s*:\\s*|\\$)${ticker}\\b`, "i").test(haystack);
      const plainTicker = !ambiguousTickers.has(ticker) && new RegExp(`(^|[^a-z0-9])${ticker}([^a-z0-9]|$)`, "i").test(haystack);
      const name = ambiguousNames[ticker]?.test(haystack) ?? new RegExp(`(^|[^a-z0-9])${company.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(haystack);
      if (marketTicker || plainTicker || name) matches.push(ticker);
    }
    if (matches.length) out.push(sourceDocument({ source: "rss", symbol: matches[0], docType: "press release", url: link,
      publishedAt: publishedAt.toISOString(), body: `${title}\n${summary}`, meta: { title, summary, symbols: matches } }, LICENSES.rss));
  }
  return out;
}
export async function collectRss(companies: Company[], since: string, get = getText): Promise<CollectedDocument[]> {
  return parseRss(await get(GLOBE_NEWSWIRE_FEED), companies, since);
}
