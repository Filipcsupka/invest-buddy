/**
 * Where each flag comes from, for the company page. Built once per symbol at scoring time from the consensus_findings
 * evidence refs already loaded for the score, plus one lookup of the stored source_documents those refs point to.
 * A link exists only for a stored source_documents row with meta.display_allowed true, or for the public SEC XBRL url.
 * Third-party data that may not be displayed (Alpha Vantage, FRED, Cboe VIX) keeps a kind and no href.
 */
export type SourceKind = "release" | "10-Q" | "10-K" | "8-K" | "form4" | "filing" | "xbrl" | "alphavantage" | "fred" | "vix" | "prices" | "pricesUniverse" | "unstored";
export interface SourceItem { kind: SourceKind; publishedAt: string | null; href: string | null }
/** What the lookup knows about a stored document. */
export interface StoredDocInfo { docType: string; publishedAt: string | null; displayAllowed: boolean }
export interface SourceRow { field: string; verified: boolean; agreement: string; evidence_refs: { url?: string; publishedAt?: string; fiscalPeriod?: string }[] }

/** Public SEC data. The XBRL facts url is not a stored source_documents row, but it is open government data and may be shown. */
export const SEC_PUBLIC_URL = /^https:\/\/data\.sec\.gov\/api\/xbrl\//;
/** Agreements that stand as verified facts. Their evidence refs may be cited. */
export const CITABLE_AGREEMENTS: ReadonlySet<string> = new Set(["agree", "verified_single", "xbrl_override", "data_rule"]);
export const MAX_SOURCES_PER_FIELD = 3;
/** One row per url of the stored documents. */
export const SOURCE_DOC_SQL = "SELECT url, doc_type, published_at::date::text AS published_at, meta->>'display_allowed' AS display_allowed FROM source_documents WHERE url = ANY($1::text[])";

/** A plain https url, nothing else. Used before any href is rendered. */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}
const isoDay = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

const THIRD_PARTY: ReadonlySet<SourceKind> = new Set(["alphavantage", "fred", "vix", "unstored"]);
function docKind(docType: string): SourceKind | null {
  if (/^8-K EX-99/.test(docType)) return "release";
  if (docType === "10-Q") return "10-Q";
  if (docType === "10-K") return "10-K";
  if (docType === "8-K") return "8-K";
  if (docType === "Form 4" || docType === "4") return "form4";
  if (docType === "EPS surprise") return "alphavantage";
  return null;
}
function hostKind(url: string): SourceKind | null {
  let host = "";
  try { host = new URL(url).hostname; } catch { return null; }
  if (/(^|\.)alphavantage\.co$/.test(host)) return "alphavantage";
  if (/(^|\.)stlouisfed\.org$/.test(host)) return "fred";
  if (/(^|\.)cboe\.com$/.test(host)) return "vix";
  return null;
}

/** One evidence ref to one source item, or null when it has no url. A third-party kind never gets an href. */
export function classifyRef(ref: { url?: string; publishedAt?: string; fiscalPeriod?: string }, doc?: StoredDocInfo): SourceItem | null {
  if (!ref.url) return null;
  const xbrl = SEC_PUBLIC_URL.test(ref.url);
  let kind: SourceKind = xbrl ? "xbrl" : (doc && docKind(doc.docType)) || hostKind(ref.url) || (ref.fiscalPeriod?.startsWith("Form 4") ? "form4" : doc?.displayAllowed ? "filing" : "unstored");
  if (!xbrl && !doc?.displayAllowed && !THIRD_PARTY.has(kind) && kind !== "form4") kind = "unstored";
  const href = xbrl ? httpsUrl(ref.url) : doc?.displayAllowed && !THIRD_PARTY.has(kind) ? httpsUrl(ref.url) : null;
  return { kind, href, publishedAt: isoDay(ref.publishedAt) ?? isoDay(doc?.publishedAt) };
}

export const sourceKey = (item: SourceItem) => item.href ?? `${item.kind}:${item.publishedAt ?? ""}`;

/** Sources per consensus field. Only verified findings with a citable agreement count, like the judge's evidence. Newest first, deduplicated, capped. */
export function buildFieldSources(rows: SourceRow[], docs: ReadonlyMap<string, StoredDocInfo>): Record<string, SourceItem[]> {
  const out: Record<string, SourceItem[]> = {};
  for (const row of rows) {
    if (!row.verified || !CITABLE_AGREEMENTS.has(row.agreement)) continue;
    const seen = new Set<string>();
    const items: SourceItem[] = [];
    for (const ref of row.evidence_refs ?? []) {
      const item = classifyRef(ref, ref.url ? docs.get(ref.url) : undefined);
      if (item && !seen.has(sourceKey(item))) { seen.add(sourceKey(item)); items.push(item); }
    }
    items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    if (items.length) out[row.field] = items.slice(0, MAX_SOURCES_PER_FIELD);
  }
  return out;
}

type Queryable = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** Looks the stored documents up with one query. Only display_allowed = 'true' counts as displayable. */
export async function loadDocInfo(pool: Queryable, urls: string[]): Promise<Map<string, StoredDocInfo>> {
  const docs = new Map<string, StoredDocInfo>();
  if (!urls.length) return docs;
  const { rows } = await pool.query(SOURCE_DOC_SQL, [urls]);
  for (const r of rows ?? []) docs.set(String(r.url), { docType: String(r.doc_type ?? ""), publishedAt: isoDay(r.published_at), displayAllowed: r.display_allowed === "true" });
  return docs;
}

/** Sources for the rows loaded for a score: one document lookup for all their citable urls. */
export async function fieldSourcesFor(pool: Queryable, rows: SourceRow[]): Promise<Record<string, SourceItem[]>> {
  const urls = [...new Set(rows.filter((r) => r.verified && CITABLE_AGREEMENTS.has(r.agreement)).flatMap((r) => (r.evidence_refs ?? []).map((e) => e.url).filter((u): u is string => !!u && !SEC_PUBLIC_URL.test(u))))];
  return buildFieldSources(rows, await loadDocInfo(pool, urls));
}
