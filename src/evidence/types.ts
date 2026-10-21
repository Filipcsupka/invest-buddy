/** Source class. The caller gives a hint; the verifier decides the class from the host. Social is a lead only. */
export const SOURCE_CLASSES = ["primary", "press", "aggregator", "social"] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

/** Result of checking one quote against its cited page. */
export type ItemStatus = "verified" | "quote_not_found" | "fetch_failed" | "blocked" | "stale";

/** One cited quote to check. */
export interface Evidence {
  url: string;
  /** Copied verbatim from the page. The verifier checks it against the fetched text. */
  quote: string;
  publishedAt: string | null;
  sourceName: string;
  sourceClassHint: SourceClass;
}
