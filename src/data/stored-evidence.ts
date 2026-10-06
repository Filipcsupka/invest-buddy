import { displayAllowedFor } from "../db/bundle";
import { freshnessDays, normalize, stripMarkup, type EvidenceRef, type EvidenceVerifier } from "./evidence";

/** `displayAllowed` follows `meta.display_allowed` (rows without it: true for edgar only), the same rule the bundle uses. */
export interface StoredDocument { body: string; publishedAt: string; displayAllowed?: boolean }
/** Finds the stored document for a url, or null when the collectors never stored it (or retention removed it). */
export type StoredDocumentLookup = (url: string) => Promise<StoredDocument | null>;

const hasMetadata = (entry: EvidenceRef) => !!entry.publishedAt && !!entry.fiscalPeriod && !!entry.quote && entry.url.startsWith("https://");

/** Inside the field's window, publishedAt equal to the stored document's date, quote found in the stored text after normalisation. */
function matchesStored(entry: EvidenceRef, stored: StoredDocument, asOf: string): boolean {
  const field = entry.claim.split(".").at(-1) ?? "";
  const published = entry.publishedAt ?? "", quote = normalize(entry.quote ?? "");
  const age = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${published}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(age) || age < 0 || age > (freshnessDays[field] ?? 30)) return false;
  if (stored.publishedAt.slice(0, 10) !== published.slice(0, 10)) return false;
  // The extractor checked its quote against the raw stored text, so accept a match there as well as in the stripped text.
  return normalize(stored.body).includes(quote) || normalize(stripMarkup(stored.body)).includes(quote);
}

/**
 * Checks a citation against the text the collectors stored, not the live page. Same rules as liveVerifier
 * (https url, publishedAt, fiscalPeriod and quote present, inside the field's window, quote found after the same normalisation),
 * plus the publishedAt date must equal the stored document's date.
 * Only a url that is not stored goes to `fallback` (the live fetch), so a stored exhibit cannot fail on redirects or rate limits.
 */
export function storedFirstVerifier(lookup: StoredDocumentLookup, fallback: EvidenceVerifier): EvidenceVerifier {
  return async (entry, asOf) => {
    if (!hasMetadata(entry)) return false;
    let stored: StoredDocument | null;
    try { stored = await lookup(entry.url); } catch { return false; }
    if (!stored) return fallback(entry, asOf);
    return matchesStored(entry, stored, asOf);
  };
}

/**
 * Stricter check used for a finding from one extractor (agreement `verified_single`): the url must be a stored, display-allowed
 * document and the quote must be in its stored text. No live fetch and no fallback.
 */
export function storedOnlyVerifier(lookup: StoredDocumentLookup): EvidenceVerifier {
  return async (entry, asOf) => {
    if (!hasMetadata(entry)) return false;
    let stored: StoredDocument | null;
    try { stored = await lookup(entry.url); } catch { return false; }
    return !!stored && stored.displayAllowed === true && matchesStored(entry, stored, asOf);
  };
}

type DocumentRow = { body: string; published_at: Date | string; source?: string; meta?: unknown };
/** Lookup over source_documents with a per-run cache, so each url is read once. */
export function pgDocumentLookup(pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: DocumentRow[] }> }): StoredDocumentLookup {
  const cache = new Map<string, StoredDocument | null>();
  return async (url) => {
    if (cache.has(url)) return cache.get(url) ?? null;
    const { rows } = await pool.query("SELECT body, published_at, source, meta FROM source_documents WHERE url = $1", [url]);
    const row = rows[0];
    const found = row ? { body: row.body, publishedAt: new Date(row.published_at).toISOString(), displayAllowed: displayAllowedFor(row.source ?? "", row.meta) } : null;
    cache.set(url, found);
    return found;
  };
}
