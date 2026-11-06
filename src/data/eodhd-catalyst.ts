import { estimateRevision, type EstimateObservation } from "./estimate-revisions";
import { daysBetween } from "./catalyst-calendar";

export const EODHD_EARNINGS_WINDOW_DAYS = 14;
export const EODHD_NEWS_WINDOW_DAYS = 7;
export const EODHD_REVISION_MIN_PCT = 5;
export const EODHD_NEWS_MIN_POLARITY = 0.6;
export const EODHD_NEWS_MIN_ARTICLES = 2;

export interface EodhdNewsEvidence {
  url: string;
  publishedAt: string;
  title: string;
  tags: string[];
  sentiment: number;
  documentId?: number;
}
export interface EodhdCatalystFact {
  present: true;
  source: "eodhd";
  kind: "earnings_revision" | "news_cluster";
  observedOn: string;
  reportDate?: string;
  evidenceCount: number;
  documentIds: number[];
}

const relevantTag = /(?:^|[-_ ])(?:PRODUCT|TECHNOLOGY|INNOVATION|BIOTECH|HEALTHCARE|REGULATION|PARTNERSHIP|APPROVAL|EARNINGS)(?:$|[-_ ])/i;
const excludedTag = /(?:^|[-_ ])(?:MARKET|STOCK|PRICE|TRADING|FOREX|CRYPTO)(?:$|[-_ ])/i;

/** Only the same EODHD report can supply a 30-day upward revision. A stale calendar gives no signal. */
export function earningsCatalyst(ticker: string, rows: EstimateObservation[], asOf: string): EodhdCatalystFact | null {
  const vendorRows = rows.filter((row) => row.sourceId === "eodhd" && row.observedOn <= asOf);
  const revision = estimateRevision(ticker, vendorRows, asOf, [30]);
  if (!revision || daysBetween(revision.currentObservedOn, asOf) > 7 || daysBetween(asOf, revision.reportDate) > EODHD_EARNINGS_WINDOW_DAYS) return null;
  const window = revision.windows[0];
  if (window.direction !== "up" || window.changePct === null || window.changePct < EODHD_REVISION_MIN_PCT) return null;
  return { present: true, source: "eodhd", kind: "earnings_revision", observedOn: revision.currentObservedOn,
    reportDate: revision.reportDate, evidenceCount: 2, documentIds: [] };
}

/** Same story under another URL: equal once case, punctuation and spacing are ignored, on the same day. */
export const newsStoryKey = (title: string, publishedAt: string) =>
  `${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}|${publishedAt.slice(0, 10)}`;

/** Two independent, strongly positive, relevant articles published within seven days. */
export function newsCatalyst(rows: EodhdNewsEvidence[], asOf: string): EodhdCatalystFact | null {
  const eligible = rows.filter((row) => {
    const age = daysBetween(row.publishedAt.slice(0, 10), asOf);
    return Number.isFinite(age) && age >= 0 && age <= EODHD_NEWS_WINDOW_DAYS && row.url.startsWith("https://")
      && row.title.trim().length > 0 && Number.isFinite(row.sentiment) && row.sentiment >= EODHD_NEWS_MIN_POLARITY
      && row.tags.some((tag) => relevantTag.test(tag) && !excludedTag.test(tag));
  });
  const seenUrls = new Set<string>(), seenStories = new Set<string>();
  const distinct = eligible.filter((row) => {
    const story = newsStoryKey(row.title, row.publishedAt);
    if (seenUrls.has(row.url) || seenStories.has(story)) return false;
    seenUrls.add(row.url); seenStories.add(story);
    return true;
  });
  if (distinct.length < EODHD_NEWS_MIN_ARTICLES) return null;
  return { present: true, source: "eodhd", kind: "news_cluster", observedOn: asOf,
    evidenceCount: distinct.length, documentIds: distinct.flatMap((row) => row.documentId === undefined ? [] : [row.documentId]) };
}
