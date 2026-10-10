import { XMLParser } from "fast-xml-parser";
import { plainText, type CollectedDocument } from "./types";
import { LICENSES, sourceDocument } from "./sources/common";
import { getText, RateLimitLockout } from "./http";

export const GLOBE_NEWSWIRE_FEED = "https://www.globenewswire.com/rssfeed";
export const PR_NEWSWIRE_FEED = "https://www.prnewswire.com/rss/news-releases-list.rss";
/** Press-release wires, tried in this order. GlobeNewswire answers 403 or times out from some networks (cluster: 15 s timeouts), so it is no longer the only one. */
export const RSS_FEEDS: readonly { id: string; url: string }[] = [
  { id: "prnewswire", url: PR_NEWSWIRE_FEED },
  { id: "globenewswire", url: GLOBE_NEWSWIRE_FEED },
];
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
export interface RssResult { documents: CollectedDocument[]; failures: { feed: string; reason: string }[]; attempted: number }
/** Reads every feed on its own. One dead feed is a failure entry, not an error; a 429 lockout still stops the run. Releases seen in two feeds are kept once, by URL. */
export async function collectRssFeeds(companies: Company[], since: string, get = getText, feeds = RSS_FEEDS): Promise<RssResult> {
  const documents = new Map<string, CollectedDocument>();
  const failures: RssResult["failures"] = [];
  for (const feed of feeds) {
    try {
      for (const doc of parseRss(await get(feed.url), companies, since)) if (!documents.has(doc.url)) documents.set(doc.url, doc);
    } catch (error) {
      if (error instanceof RateLimitLockout) throw error;
      failures.push({ feed: feed.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { documents: [...documents.values()], failures, attempted: feeds.length };
}
export const describeRssFailures = (failures: RssResult["failures"]) => failures.map((failure) => `${failure.feed}: ${failure.reason}`).join("; ");
/** Throws only when every feed failed. */
export async function collectRss(companies: Company[], since: string, get = getText): Promise<CollectedDocument[]> {
  const result = await collectRssFeeds(companies, since, get);
  if (result.failures.length === result.attempted) throw new Error(`All RSS feeds failed: ${describeRssFailures(result.failures)}`);
  return result.documents;
}
