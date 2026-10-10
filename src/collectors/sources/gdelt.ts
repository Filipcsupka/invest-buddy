import type { CollectedDocument } from "../types";
import { RateLimitLockout } from "../http";
import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, newsName, parseJson, PING_REQUEST, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

export const MAX_RECORDS = 15;
/** GDELT states one request per 5 seconds. The client spaces requests 6 s apart, waits 15 s after a 429, and allows 30 s per answer: it took 11 to 19 s on 2026-10-05. */
export const GDELT_REQUEST = { timeoutMs: 30_000 } as const;
export const docUrl = (query: string, max = MAX_RECORDS) => `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${max}&timespan=2d&sort=datedesc`;
export interface Article { headline: string; url: string; domain: string; published: string }

/** `seendate` is YYYYMMDDTHHMMSSZ. An empty match returns `{}`. A rate-limit message is plain text, not JSON. */
export function parseArticles(text: string): { articles: Article[]; skippedInsecure: number } {
  const body = parseJson<{ articles?: { url?: string; title?: string; seendate?: string; domain?: string }[] }>(text, "GDELT");
  const articles: Article[] = [];
  let skippedInsecure = 0;
  for (const item of body.articles ?? []) {
    const seen = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(item.seendate ?? "");
    if (!item.url || !item.title || !seen) continue;
    if (!item.url.startsWith("https://")) { skippedInsecure++; continue; }
    articles.push({ headline: item.title.replace(/\s+/g, " ").trim(), url: item.url, domain: item.domain ?? "", published: `${seen[1]}-${seen[2]}-${seen[3]}T${seen[4]}:${seen[5]}:${seen[6]}Z` });
  }
  return { articles, skippedInsecure };
}

/** Stop starting new tickers after this long. The Job deadline is 30 minutes; at 11 to 19 s per answer plus 6 s spacing, 35 tickers take 10 to 15 minutes. */
export const GDELT_BUDGET_MS = 20 * 60_000;

/**
 * One request per ticker. Keeps what it has when a later ticker fails: a 429 lockout stops the loop (the next call would be refused too),
 * a timeout or bad answer skips that ticker. Only when nothing was stored does a lockout propagate as the source failing.
 * `clock` is injectable so a test can stand in for the 11 to 19 s answers.
 */
export async function collectGdelt(ctx: SourceContext, clock: () => number = Date.now, budgetMs = GDELT_BUDGET_MS): Promise<SourceOutput> {
  const byUrl = new Map<string, CollectedDocument>();
  const failures: { ticker: string; reason: string }[] = [];
  let skippedInsecure = 0;
  const started = clock();
  const companies = ctx.companies.filter((item) => ctx.symbols.includes(item.symbol));
  for (const [index, company] of companies.entries()) {
    if (clock() - started > budgetMs) { failures.push({ ticker: company.symbol, reason: `not fetched: GDELT time budget of ${Math.round(budgetMs / 60000)} min used, ${companies.length - index} tickers left` }); break; }
    let parsed: ReturnType<typeof parseArticles>;
    try { parsed = parseArticles(await ctx.http.get(docUrl(`"${newsName(company)}" sourcelang:english`), GDELT_REQUEST)); }
    catch (error) {
      if (error instanceof RateLimitLockout && !byUrl.size && !failures.length) throw error;
      failures.push({ ticker: company.symbol, reason: error instanceof Error ? error.message : String(error) });
      if (error instanceof RateLimitLockout) break;
      continue;
    }
    skippedInsecure += parsed.skippedInsecure;
    for (const article of parsed.articles) {
      if (article.published.slice(0, 10) < ctx.since) continue;
      const symbols = new Set<string>((byUrl.get(article.url)?.meta.symbols as string[] | undefined) ?? []);
      symbols.add(company.symbol);
      byUrl.set(article.url, sourceDocument({ source: "gdelt", symbol: null, docType: "news headline", url: article.url, publishedAt: article.published, body: article.headline,
        meta: { headline: article.headline, outlet: article.domain, symbols: [...symbols] } }, LICENSES.gdelt));
    }
  }
  if (skippedInsecure) process.stderr.write(`GDELT: skipped ${skippedInsecure} non-HTTPS article links\n`);
  return { documents: [...byUrl.values()], facts: [], ...(failures.length ? { failures } : {}) };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("gdelt", async () => {
  const { articles } = parseArticles(await http.get(docUrl('"NVIDIA" sourcelang:english', 3), PING_REQUEST));
  return articles.length ? `${articles.length} articles, newest ${articles[0].published}` : "reachable, valid JSON, 0 articles in window";
});
