import { freshnessDays, normalize, stripMarkup, type EvidenceVerifier } from "./evidence";

export interface StoredDocument { body: string; publishedAt: string }
/** Finds the stored document for a url, or null when the collectors never stored it (or retention removed it). */
export type StoredDocumentLookup = (url: string) => Promise<StoredDocument | null>;

/**
 * Checks a citation against the text the collectors stored, not the live page. Same rules as liveVerifier
 * (https url, publishedAt, fiscalPeriod and quote present, inside the field's window, quote found after the same normalisation),
 * plus the publishedAt date must equal the stored document's date.
 * Only a url that is not stored goes to `fallback` (the live fetch), so a stored exhibit cannot fail on redirects or rate limits.
 */
export function storedFirstVerifier(lookup: StoredDocumentLookup, fallback: EvidenceVerifier): EvidenceVerifier {
  return async (entry, asOf) => {
    if (!entry.publishedAt || !entry.fiscalPeriod || !entry.quote || !entry.url.startsWith("https://")) return false;
    let stored: StoredDocument | null;
    try { stored = await lookup(entry.url); } catch { return false; }
    if (!stored) return fallback(entry, asOf);
    const field = entry.claim.split(".").at(-1) ?? "";
    const age = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${entry.publishedAt}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(age) || age < 0 || age > (freshnessDays[field] ?? 30)) return false;
    if (stored.publishedAt.slice(0, 10) !== entry.publishedAt.slice(0, 10)) return false;
    const quote = normalize(entry.quote);
    // The extractor checked its quote against the raw stored text, so accept a match there as well as in the stripped text.
    return normalize(stored.body).includes(quote) || normalize(stripMarkup(stored.body)).includes(quote);
  };
}

/** Lookup over source_documents with a per-run cache, so each url is read once. */
export function pgDocumentLookup(pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: { body: string; published_at: Date | string }[] }> }): StoredDocumentLookup {
  const cache = new Map<string, StoredDocument | null>();
  return async (url) => {
    if (cache.has(url)) return cache.get(url) ?? null;
    const { rows } = await pool.query("SELECT body, published_at FROM source_documents WHERE url = $1", [url]);
    const found = rows[0] ? { body: rows[0].body, publishedAt: new Date(rows[0].published_at).toISOString() } : null;
    cache.set(url, found);
    return found;
  };
}
