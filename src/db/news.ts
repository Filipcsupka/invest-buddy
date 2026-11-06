import type pg from "pg";
import { canDisplay } from "../data/sources-registry";
import { getPool } from "./pool";
import { isoDay, num, record, text, type Parsed } from "./economy-vendor";

type Query = Pick<pg.Pool, "query">;

export interface NewsRow { link: string; publishedAt: string; title: string; symbols: string[]; tags: string[]; polarity: number | null; neg: number | null; neu: number | null; pos: number | null }
export interface SentimentRow { symbol: string; date: string; score: number; count: number | null }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
/** Vendor titles arrive HTML-escaped ("&amp;"). Decode the named and numeric entities; React escapes the text again on output. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const strings = (value: unknown, upper = false): string[] => Array.isArray(value)
  ? [...new Set(value.map((item) => text(item)).filter((item): item is string => !!item).map((item) => upper ? item.toUpperCase() : item))].slice(0, 60) : [];

/**
 * /news rows. Required: an https link, a title and a parseable date. Only the headline, link, tickers, tags and the vendor's sentiment
 * numbers are kept; the article body (`content`) is dropped here and never stored.
 */
export function parseNews(payload: unknown): Parsed<NewsRow> {
  if (!Array.isArray(payload)) return { rows: [], skipped: 1 };
  const rows = new Map<string, NewsRow>();
  let skipped = 0;
  for (const item of payload) {
    const row = record(item);
    const title = text(row?.title);
    const raw = text(row?.link);
    const time = text(row?.date);
    let link: string | null = null;
    try { link = raw && new URL(raw).protocol === "https:" ? raw : null; } catch { link = null; }
    const published = time ? Date.parse(time) : NaN;
    if (!row || !title || !link || !Number.isFinite(published)) { skipped++; continue; }
    const sentiment = record(row.sentiment);
    rows.set(link, { link, publishedAt: new Date(published).toISOString(), title: decodeEntities(title).slice(0, 500), symbols: strings(row.symbols, true), tags: strings(row.tags, true),
      polarity: num(sentiment?.polarity), neg: num(sentiment?.neg), neu: num(sentiment?.neu), pos: num(sentiment?.pos) });
  }
  return { rows: [...rows.values()], skipped };
}

/** /sentiments: `{ "AAPL.US": [{ date, count, normalized }] }`. A point without a date or a numeric score is skipped. */
export function parseSentiments(payload: unknown): Parsed<SentimentRow> {
  const body = record(payload);
  if (!body) return { rows: [], skipped: 1 };
  const rows: SentimentRow[] = [];
  let skipped = 0;
  for (const [symbol, points] of Object.entries(body)) {
    if (!Array.isArray(points)) { skipped++; continue; }
    for (const item of points) {
      const point = record(item);
      const date = isoDay(point?.date);
      const score = num(point?.normalized);
      if (!date || score === null || score < -1 || score > 1) { skipped++; continue; }
      const count = num(point?.count);
      rows.push({ symbol: symbol.toUpperCase(), date, score, count: count === null ? null : Math.trunc(count) });
    }
  }
  return { rows, skipped };
}

export async function upsertNews(db: Query, rows: NewsRow[]): Promise<number> {
  if (!rows.length) return 0;
  const result = await db.query(`INSERT INTO news_items (link,published_at,title,symbols,tags,polarity,neg,neu,pos,display_allowed)
    SELECT v.link,v.at,v.title,ARRAY(SELECT jsonb_array_elements_text(v.symbols::jsonb)),ARRAY(SELECT jsonb_array_elements_text(v.tags::jsonb)),v.polarity,v.neg,v.neu,v.pos,$10
    FROM unnest($1::text[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::numeric[],$7::numeric[],$8::numeric[],$9::numeric[]) AS v(link,at,title,symbols,tags,polarity,neg,neu,pos)
    ON CONFLICT (link) DO UPDATE SET title=EXCLUDED.title, symbols=EXCLUDED.symbols, tags=EXCLUDED.tags, polarity=EXCLUDED.polarity, neg=EXCLUDED.neg,
      neu=EXCLUDED.neu, pos=EXCLUDED.pos, display_allowed=EXCLUDED.display_allowed
    WHERE (news_items.title,news_items.symbols,news_items.tags,news_items.polarity,news_items.display_allowed)
      IS DISTINCT FROM (EXCLUDED.title,EXCLUDED.symbols,EXCLUDED.tags,EXCLUDED.polarity,EXCLUDED.display_allowed)`,
  [rows.map((r) => r.link), rows.map((r) => r.publishedAt), rows.map((r) => r.title), rows.map((r) => JSON.stringify(r.symbols)), rows.map((r) => JSON.stringify(r.tags)),
    rows.map((r) => r.polarity), rows.map((r) => r.neg), rows.map((r) => r.neu), rows.map((r) => r.pos), canDisplay("eodhd")]);
  return result.rowCount ?? 0;
}

/** Headlines older than `days` are removed; the feed shows recent news only. */
export async function pruneNews(db: Query, days: number): Promise<number> {
  const result = await db.query("DELETE FROM news_items WHERE published_at < now() - make_interval(days => $1::int)", [days]);
  return result.rowCount ?? 0;
}

export async function upsertSentiment(db: Query, rows: SentimentRow[]): Promise<number> {
  if (!rows.length) return 0;
  const result = await db.query(`INSERT INTO sentiment_daily (symbol,obs_date,score,article_count,display_allowed)
    SELECT v.s,v.d,v.score,v.n,$5 FROM unnest($1::text[],$2::date[],$3::numeric[],$4::int[]) AS v(s,d,score,n)
    ON CONFLICT (symbol,obs_date) DO UPDATE SET score=EXCLUDED.score, article_count=EXCLUDED.article_count, display_allowed=EXCLUDED.display_allowed, fetched_at=now()
    WHERE (sentiment_daily.score,sentiment_daily.article_count,sentiment_daily.display_allowed) IS DISTINCT FROM (EXCLUDED.score,EXCLUDED.article_count,EXCLUDED.display_allowed)`,
  [rows.map((r) => r.symbol), rows.map((r) => r.date), rows.map((r) => r.score), rows.map((r) => r.count), canDisplay("eodhd")]);
  return result.rowCount ?? 0;
}

export async function markSentimentFetched(db: Query, symbols: string[]): Promise<void> {
  if (!symbols.length) return;
  await db.query(`INSERT INTO sentiment_fetches (symbol,fetched_at) SELECT s, now() FROM unnest($1::text[]) AS s
    ON CONFLICT (symbol) DO UPDATE SET fetched_at=EXCLUDED.fetched_at`, [symbols]);
}

/** Candidates ordered by the oldest previous request (never-fetched first), with the day each was last fetched. */
export async function sentimentQueue(db: Query, symbols: string[]): Promise<{ symbol: string; lastFetched: string | null }[]> {
  if (!symbols.length) return [];
  const result = await db.query<{ symbol: string; last: string | null }>(`SELECT s AS symbol, (f.fetched_at AT TIME ZONE 'UTC')::date::text AS last
    FROM unnest($1::text[]) AS s LEFT JOIN sentiment_fetches f ON f.symbol=s ORDER BY f.fetched_at ASC NULLS FIRST, s`, [symbols]);
  return result.rows.map((row) => ({ symbol: row.symbol, lastFetched: row.last }));
}

/** Enabled crypto assets from the shared market table. */
export async function cryptoSymbols(db: Query): Promise<string[]> {
  const result = await db.query<{ vendor_symbol: string }>("SELECT vendor_symbol FROM tracked_assets WHERE enabled AND asset_class='crypto' ORDER BY sort, vendor_symbol");
  return result.rows.map((row) => row.vendor_symbol);
}

// Read models for /news and the sentiment sparkline.

export interface NewsItemView { link: string; publishedAt: string; title: string; symbols: string[]; tags: string[]; polarity: number | null }
export interface NewsFilter { ticker?: string; tag?: string; limit?: number }

/** Newest first. A ticker without an exchange suffix (AAPL) matches every listing (AAPL.US); with a suffix it matches exactly. */
export async function newsFeed(filter: NewsFilter = {}, db: Query | null = getPool()): Promise<NewsItemView[]> {
  if (!db) return [];
  const ticker = filter.ticker?.toUpperCase() ?? null;
  const result = await db.query<NewsItemView>(`SELECT link, published_at AS "publishedAt", title, symbols, tags, polarity::float8 AS polarity
    FROM news_items
    WHERE ($1::text IS NULL OR EXISTS (SELECT 1 FROM unnest(symbols) s WHERE s=$1 OR (strpos($1,'.')=0 AND s LIKE $1 || '.%')))
      AND ($2::text IS NULL OR $2 = ANY(tags))
    ORDER BY published_at DESC, link LIMIT $3`, [ticker, filter.tag?.toUpperCase() ?? null, Math.min(filter.limit ?? 100, 300)]);
  return result.rows.map((row) => ({ ...row, publishedAt: new Date(row.publishedAt).toISOString(), polarity: row.polarity === null ? null : Number(row.polarity) }));
}

/** The most frequent tags of the last `days` days, for the filter bar. */
export async function topNewsTags(days = 7, limit = 12, db: Query | null = getPool()): Promise<{ tag: string; count: number }[]> {
  if (!db) return [];
  const result = await db.query<{ tag: string; count: string }>(`SELECT tag, count(*) AS count FROM news_items, unnest(tags) AS tag
    WHERE published_at >= now() - make_interval(days => $1::int) GROUP BY tag ORDER BY count(*) DESC, tag LIMIT $2`, [days, limit]);
  return result.rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}

export interface SentimentPointView { date: string; score: number; count: number | null }
/** Daily vendor sentiment for one EODHD symbol over the last `days` days, oldest first. */
export async function sentimentSeries(symbol: string, days = 30, db: Query | null = getPool()): Promise<SentimentPointView[]> {
  if (!db) return [];
  const result = await db.query<SentimentPointView>(`SELECT obs_date::text AS date, score::float8 AS score, article_count AS count FROM sentiment_daily
    WHERE symbol=$1 AND obs_date >= CURRENT_DATE - $2::int ORDER BY obs_date LIMIT 400`, [symbol.toUpperCase(), days]);
  return result.rows.map((row) => ({ ...row, score: Number(row.score) }));
}
