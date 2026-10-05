import { XMLParser } from "fast-xml-parser";
import { plainText, type CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, newsName, PING_REQUEST, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

export const NEWS_ITEMS_PER_QUERY = 10;
export const searchUrl = (query: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
const many = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

export interface Headline { headline: string; link: string; source: string; published: string }
/** Headline, link, outlet and time only. The feed description is a copy of the headline in HTML and is dropped. */
export function parseNews(xml: string): Headline[] {
  const channel = parser.parse(xml).rss?.channel;
  if (!channel) throw new Error("Google News: not an RSS feed");
  const out: Headline[] = [];
  for (const item of many<Record<string, unknown>>(channel.item)) {
    const link = String(item.link ?? "");
    const published = new Date(String(item.pubDate ?? ""));
    const rawSource = item.source;
    const source = plainText(String(typeof rawSource === "object" && rawSource ? (rawSource as Record<string, unknown>)["#text"] ?? "" : rawSource ?? ""), 200);
    let headline = plainText(String(item.title ?? ""), 1000);
    if (source && headline.endsWith(` - ${source}`)) headline = headline.slice(0, -(source.length + 3));
    if (!headline || !link.startsWith("https://") || !Number.isFinite(published.getTime())) continue;
    out.push({ headline, link, source, published: published.toISOString() });
  }
  return out;
}

export async function collectGnews(ctx: SourceContext): Promise<SourceOutput> {
  const queries: { query: string; symbol?: string; theme?: string }[] = ctx.companies.filter((company) => ctx.symbols.includes(company.symbol))
    .map((company) => ({ query: `"${newsName(company)}" stock when:2d`, symbol: company.symbol }));
  for (const theme of new Set(ctx.companies.map((company) => company.sector).filter((sector): sector is string => Boolean(sector)))) queries.push({ query: `${theme} stocks when:2d`, theme });
  const byLink = new Map<string, CollectedDocument>();
  for (const { query, symbol, theme } of queries) {
    for (const item of parseNews(await ctx.http.get(searchUrl(query))).slice(0, NEWS_ITEMS_PER_QUERY)) {
      if (item.published.slice(0, 10) < ctx.since) continue;
      const existing = byLink.get(item.link);
      const symbols = new Set<string>(existing ? (existing.meta.symbols as string[]) : []);
      const themes = new Set<string>(existing ? (existing.meta.themes as string[]) : []);
      if (symbol) symbols.add(symbol);
      if (theme) themes.add(theme);
      // symbol stays null: these are low-signal headlines and detect must not treat each one as a reason to rescan a ticker.
      byLink.set(item.link, sourceDocument({ source: "gnews", symbol: null, docType: "news headline", url: item.link, publishedAt: item.published, body: item.headline,
        meta: { headline: item.headline, outlet: item.source, symbols: [...symbols], themes: [...themes] } }, LICENSES.gnews));
    }
  }
  return { documents: [...byLink.values()], facts: [] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("gnews", async () => {
  const items = parseNews(await http.get(searchUrl('"NVIDIA" stock when:2d'), PING_REQUEST));
  if (!items.length) throw new Error("feed parsed but has no items");
  return `${items.length} headlines, newest ${items[0].published.slice(0, 16)}Z`;
});
