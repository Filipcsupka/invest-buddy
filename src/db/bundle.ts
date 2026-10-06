import type pg from "pg";
import { freshnessDays } from "../data/evidence";

/** Stored text the extractor may read for one ticker. The model never gets web tools; this is its whole world. */
export interface BundleDocument { id: number; url: string; source: string; docType: string; publishedAt: string; displayAllowed: boolean; excerpt: string }
export interface BundleFact { key: string; asOf: string; value: unknown; documentIds: number[] }
export interface Bundle { symbol: string; generatedAt: string; since: string; documents: BundleDocument[]; facts: BundleFact[] }

export interface RawDocument { id: number; url: string; source: string; docType: string; publishedAt: string; displayAllowed?: boolean; body: string }
export interface BundleLimits { perDocument: number; total: number; maxDocuments: number }
export const DEFAULT_LIMITS: BundleLimits = { perDocument: 6000, total: 60000, maxDocuments: 24 };

/**
 * Whether a document may back a claim that is shown on the public page. An explicit meta.display_allowed boolean wins.
 * Rows without the key come from the legacy collectors: EDGAR is public data, everything else (rss, unknown) is not cleared.
 */
export function displayAllowedFor(source: string, meta: unknown): boolean {
  const flag = meta && typeof meta === "object" ? (meta as { display_allowed?: unknown }).display_allowed : undefined;
  return typeof flag === "boolean" ? flag : source === "edgar";
}

/** Longest freshness window (days) of any field a document can support. The values come from evidence.ts, which reconcile uses. */
export function windowDaysFor(docType: string): number {
  if (/EX-99\.[12]/i.test(docType) || /^(10-Q|10-K|20-F|6-K|8-K)/i.test(docType)) return Math.max(freshnessDays.revenueAccelerating, freshnessDays.epsBeat, freshnessDays.guidanceRaised);
  // sec-frames growth rows are dated at quarter end and only exist 45+ days later, so a 30-day window would always drop them.
  if (docType === "XBRL revenue growth") return Math.max(freshnessDays.revenueAccelerating, freshnessDays.revenueDeclining);
  if (docType === "4") return freshnessDays.insiderOrInstitutionalBuying;
  return Math.max(freshnessDays.productCatalyst, freshnessDays.narrativeChanged);
}
export const MAX_WINDOW_DAYS = Math.max(...Object.values(freshnessDays));

/** Keeps documents published on or before asOf (whole day) and inside the document type's window. */
export function withinWindow(doc: Pick<RawDocument, "docType" | "publishedAt">, asOf: string): boolean {
  const age = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${doc.publishedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(age) && age >= 0 && age <= windowDaysFor(doc.docType);
}

/** Earnings exhibits and filings are most useful, then everything else newest first. Bounded so one ticker stays well under the model context. */
const priority = (docType: string) => /EX-99\.[12]/i.test(docType) ? 0 : /^(10-Q|10-K|20-F|6-K)$/i.test(docType) ? 1 : /^8-K/i.test(docType) ? 2 : docType === "4" ? 3 : 4;

const SEPARATOR = "\n[...]\n";
const KEYWORDS = /\b(?:Item\s+\d{1,2}\.\d{2}|total revenue|net revenue|revenues?|net sales|year[- ]over[- ]year|growth|guidance|outlook|rais(?:es|ed|ing)|lower(?:s|ed|ing)|reaffirms?|EPS|earnings per share|repurchases?|backlog|remaining performance obligations|RPO|ARR|launch(?:es|ed)?|major customer|partnership|approv(?:al|ed)|appointed|resigned|lawsuit|investigation|strategy change)\b/gi;
/** 8-K item headings ("Item 5.02 Departure of Directors ...") start the event text, so they keep more of what follows. */
const ITEM = /^Item\s/i;
const ITEM_AFTER = 1200;
/** "emerging growth company" is cover-page boilerplate on every SEC form; it must not use the excerpt budget. */
const isBoilerplate = (body: string, index: number, word: string) => /^growth$/i.test(word) && /emerging\s+$/i.test(body.slice(Math.max(0, index - 12), index));

/**
 * Keep keyword windows from long filings. Specific terms get first use of the budget;
 * selected windows are emitted in document order. Each piece is copied from the stored body.
 */
export function focusExcerpt(body: string, room: number): string {
  if (body.length <= room) return body;
  const half = 220;
  const spans: { start: number; end: number; priority: number; item: boolean }[] = [];
  for (const match of body.matchAll(KEYWORDS)) {
    if (isBoilerplate(body, match.index, match[0])) continue;
    const item = ITEM.test(match[0]);
    const start = Math.max(0, match.index - (item ? 0 : half)), end = Math.min(body.length, match.index + match[0].length + (item ? ITEM_AFTER : half));
    const priority = /^(?:Item\s|total revenue|net revenue|net sales|year[- ]over[- ]year|growth|guidance|outlook|rais|lower|reaffirm|EPS|earnings per share|repurchase|backlog|remaining performance obligations|RPO|ARR|launch|major customer|partnership|approv|appointed|resigned|lawsuit|investigation|strategy change)/i.test(match[0]) ? 0 : 1;
    const last = spans[spans.length - 1];
    if (last && start <= last.end && end - last.start <= (item || last.item ? ITEM_AFTER + 300 : 900)) { last.end = Math.max(last.end, end); last.priority = Math.min(last.priority, priority); last.item ||= item; }
    else spans.push({ start, end, priority, item });
  }
  if (!spans.length) return body.slice(0, room);
  const selected: typeof spans = [];
  let used = 0;
  for (const span of [...spans].sort((a, b) => a.priority - b.priority || a.start - b.start)) {
    const left = room - used - (selected.length ? SEPARATOR.length : 0);
    if (left <= 0) break;
    const length = Math.min(span.end - span.start, left);
    if (length < span.end - span.start && selected.length) continue;
    selected.push({ ...span, end: span.start + length });
    used += length + (selected.length > 1 ? SEPARATOR.length : 0);
  }
  let previousEnd = 0;
  const parts: string[] = [];
  for (const span of selected.sort((a, b) => a.start - b.start)) {
    const start = Math.max(span.start, previousEnd);
    if (start < span.end) parts.push(body.slice(start, span.end));
    previousEnd = Math.max(previousEnd, span.end);
  }
  return parts.join(SEPARATOR);
}

export function selectExcerpts(docs: RawDocument[], limits: BundleLimits = DEFAULT_LIMITS): BundleDocument[] {
  const ranked = [...docs].sort((a, b) => priority(a.docType) - priority(b.docType) || b.publishedAt.localeCompare(a.publishedAt) || a.id - b.id);
  const out: BundleDocument[] = [];
  let used = 0;
  for (const doc of ranked) {
    if (out.length >= limits.maxDocuments) break;
    const room = Math.min(limits.perDocument, limits.total - used);
    if (room <= 0) break;
    const excerpt = focusExcerpt(doc.body, room);
    used += excerpt.length;
    out.push({ id: doc.id, url: doc.url, source: doc.source, docType: doc.docType, publishedAt: doc.publishedAt, displayAllowed: doc.displayAllowed === true, excerpt });
  }
  return out;
}

/**
 * Documents for one symbol that existed on asOf: published on or before that day, inside each type's window, newest first with id as tiebreaker.
 * `days` only widens or narrows the database scan; the per-type windows still apply.
 */
export async function buildBundle(pool: pg.Pool, symbol: string, days = MAX_WINDOW_DAYS, now = new Date(), limits: BundleLimits = DEFAULT_LIMITS, asOf = now.toISOString().slice(0, 10)): Promise<Bundle> {
  const since = new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const docs = await pool.query<{ id: string; url: string; source: string; doc_type: string; published_at: Date; meta: unknown; body: string }>(
    `SELECT id::text, url, source, doc_type, published_at, meta, body FROM source_documents
     WHERE (symbol = $1 OR (source = 'rss' AND meta->'symbols' ? $1)) AND published_at >= $2::date AND published_at < ($3::date + 1) AND expires_at > now()
     ORDER BY published_at DESC, id LIMIT 200`, [symbol, since, asOf]);
  const facts = await pool.query<{ fact_key: string; as_of: string; value: unknown; document_ids: string[] }>(
    `SELECT fact_key, as_of::text AS as_of, value, document_ids::text[] AS document_ids FROM collected_facts
     WHERE symbol = $1 AND as_of <= $2::date AND expires_at > now() ORDER BY as_of DESC, fact_key LIMIT 100`, [symbol, asOf]);
  const raw: RawDocument[] = docs.rows.map((r) => ({ id: Number(r.id), url: r.url, source: r.source, docType: r.doc_type, publishedAt: new Date(r.published_at).toISOString(), displayAllowed: displayAllowedFor(r.source, r.meta), body: r.body }));
  return {
    symbol, generatedAt: now.toISOString(), since,
    documents: selectExcerpts(raw.filter((d) => withinWindow(d, asOf)), limits),
    facts: facts.rows.map((r) => ({ key: r.fact_key, asOf: r.as_of.slice(0, 10), value: r.value, documentIds: r.document_ids.map(Number) })),
  };
}
