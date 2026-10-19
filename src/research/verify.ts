import { createHash } from "node:crypto";
import type pg from "pg";
import type { CollectedDocument } from "../collectors/types";
import { putSnapshot } from "../data/raw-store";
import { CapReached, type UsageLedger } from "../data/usage";
import {
  BodyTooLarge, decodeBody, guardedGet, mediaType, RobotsDisallowed, safeUrl, UrlBlocked, type GuardDeps, type GuardedPage,
} from "./fetch-guard";
import { findQuoteInSecExhibits, type SecGet } from "./sec-fallback";
import { extractPageDate, findQuote, htmlToText, normalizeText, toIsoDate } from "./html-text";
import { CLASS_RANK, classifyHost, dataSourceIdFor, displayQuoteAllowed, irDomainsFor, RESEARCH_SOURCE_ID } from "./sources";
import { READING_LABEL, type ResearchEvidence, type SourceClass, type VerificationStatus } from "./types";

/** A source older than this many days before the run date is stale (design doc: placeholder for every kind). */
export const STALE_DAYS = 90;
/** Body kept in source_documents is capped by the table (200 KB). */
const MAX_DOCUMENT_BYTES = 200 * 1024;
const DAY_MS = 86_400_000;

export type ItemStatus = Exclude<VerificationStatus, "pending" | "lead_only">;

export interface ItemResult {
  url: string;
  status: ItemStatus;
  reason: string;
  /** Class from the host of the page that was read. */
  sourceClass: SourceClass;
  /** True when the model's hint differs from the class decided here. Logged, never used. */
  hintMismatch: boolean;
  dataSourceId: string;
  displayQuote: boolean;
  canonicalUrl?: string;
  snapshotId?: number;
  documentId?: number;
  pageDate?: string;
  match?: "exact" | "fuzzy";
  publisher?: string;
  /** Stored with the row so the card can show the reading label. Set only for verified items. */
  readingLabel?: string;
}

export interface FindingResult {
  status: VerificationStatus;
  confirmed: boolean;
  /** Class of the best verified item, else of the best item. */
  sourceClass: SourceClass | null;
  sourceId: string | null;
  snapshotId: number | null;
  documentId: number | null;
  readingLabel: string | null;
  displayQuote: boolean;
  items: ItemResult[];
}

export interface DocumentSink { upsertDocument(doc: CollectedDocument): Promise<{ id: number; written: boolean }> }

export interface VerifyDeps extends GuardDeps {
  /** Raw store connection (D17). Without it nothing is stored and no snapshot id is returned. */
  db?: Pick<pg.Pool, "query">;
  /** Stores the `research_page` document. Without it no document is written. */
  documents?: DocumentSink;
  /** Usage ledger (D8). Each request sent is reserved under `research_web` first. */
  ledger?: UsageLedger;
  runId?: string;
  /** Company IR domains for the finding's symbol. Defaults to the registry. */
  irDomains?: Iterable<string>;
  symbol?: string;
  /** Reader for SEC pages (JSON and HTML). Defaults to the collector fetcher, which keeps the SEC rate slot and User-Agent. */
  secGet?: SecGet;
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** URL used as the raw store key and document URL: no fragment, no tracking parameters, sorted query, lower-case host. */
export function canonicalUrl(value: string | URL): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const kept = [...url.searchParams.entries()].filter(([key]) => !/^(utm_|fbclid$|gclid$|mc_[a-z]+$|ref$|ref_src$)/i.test(key));
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, val] of kept) url.searchParams.append(key, val);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "request timed out";
    return error.message.replace(/https?:\/\/[^\s)]+/g, (u) => safeUrl(u)).slice(0, 300);
  }
  return "request failed";
}

function clip(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, "utf8");
  return buffer.length <= maxBytes ? text : buffer.subarray(0, maxBytes).toString("utf8").replace(/�+$/, "");
}

/**
 * The cited page could not be read (a company site that blocks bots, a timeout). Press releases are also filed with SEC as 8-K
 * exhibits, so look for the quote there. Returns null when SEC does not hold it; the caller keeps the original failure.
 */
async function viaSecExhibit(
  evidence: ResearchEvidence, deps: VerifyDeps, now: Date, reason: string,
  make: (status: ItemStatus, reason: string, extra?: Partial<ItemResult>) => ItemResult,
): Promise<ItemResult | null> {
  let hit;
  try {
    hit = await findQuoteInSecExhibits(deps.symbol!, evidence.quote ?? "", { anchor: toIsoDate(evidence.publishedAt), now, fallbackDays: STALE_DAYS, get: deps.secGet });
  } catch { return null; }
  if (!hit) return null;
  const canonical = canonicalUrl(hit.url);
  const ageDays = Math.floor(now.getTime() / DAY_MS - dayNumber(hit.filedAt));
  const via = `cited page not readable (${reason}); quote found in SEC ${hit.docType} filed ${hit.filedAt}`;
  const extra: Partial<ItemResult> = { canonicalUrl: canonical, match: hit.match, pageDate: hit.filedAt };
  if (ageDays > STALE_DAYS) return make("stale", `${via}; ${ageDays} days old, limit is ${STALE_DAYS}`, extra);
  if (deps.db) {
    try {
      const stored = await putSnapshot(deps.db, {
        sourceId: "sec", key: `research:${canonical}`, body: Buffer.from(hit.text, "utf8"), contentType: "text/plain", fetchedAt: now,
        meta: { url: evidence.url, final_url: safeUrl(canonical), via: "sec_exhibit", source_name: evidence.sourceName },
      });
      extra.snapshotId = stored.id;
    } catch { /* the snapshot is optional; the verdict stands */ }
  }
  return make("verified", via, { ...extra, readingLabel: READING_LABEL });
}

/** Verifies one evidence item. Never throws for a bad source; the status says what happened. */
export async function verifyEvidence(evidence: ResearchEvidence, deps: VerifyDeps = {}): Promise<ItemResult> {
  const now = deps.now?.() ?? new Date();
  let host = "";
  try { host = new URL(evidence.url).hostname.toLowerCase().replace(/\.$/, ""); } catch { /* the guard reports it */ }
  const irDomains = [...(deps.irDomains ?? (deps.symbol ? irDomainsFor(deps.symbol) : []))];
  const make = (status: ItemStatus, reason: string, extra: Partial<ItemResult> = {}): ItemResult => {
    const h = extra.canonicalUrl ? new URL(extra.canonicalUrl).hostname : host;
    const sourceClass = h ? classifyHost(h, irDomains) : "aggregator";
    return {
      url: evidence.url, status, reason, sourceClass, hintMismatch: evidence.sourceClassHint !== sourceClass,
      dataSourceId: h ? dataSourceIdFor(h) : RESEARCH_SOURCE_ID, displayQuote: h ? displayQuoteAllowed(h, sourceClass) && status === "verified" : false,
      publisher: evidence.sourceName, ...extra,
    };
  };

  const wanted = normalizeText(evidence.quote ?? "");
  if (!wanted) return make("quote_not_found", "quote is empty");

  const guard: GuardDeps = {
    ...deps,
    beforeRequest: async () => {
      if (deps.ledger) await deps.ledger.reserve(RESEARCH_SOURCE_ID, 1, { job: "research-verify", runId: deps.runId ?? null, now });
      await deps.beforeRequest?.();
    },
  };
  let page: GuardedPage;
  try {
    page = await guardedGet(evidence.url, guard);
  } catch (error) {
    const reason = describeError(error);
    if (error instanceof UrlBlocked) return make("blocked", `blocked: ${reason}`);
    if (error instanceof RobotsDisallowed) return make("blocked", reason);
    if (error instanceof BodyTooLarge) return make("fetch_failed", `page is over the byte limit`);
    if (error instanceof CapReached) return make("fetch_failed", `usage cap: ${reason}`);
    const failed = make("fetch_failed", reason);
    if (!deps.symbol) return failed;
    return (await viaSecExhibit(evidence, deps, now, reason, make)) ?? failed;
  }

  const canonical = canonicalUrl(page.finalUrl);
  const type = mediaType(page.contentType);
  const known = { canonicalUrl: canonical };
  let snapshotId: number | undefined;
  let note = "";
  const snapshotKey = `research:${canonical}`;
  const finalHost = page.finalUrl.hostname.toLowerCase();
  const sourceId = dataSourceIdFor(finalHost);
  if (deps.db) {
    try {
      const stored = await putSnapshot(deps.db, {
        sourceId, key: snapshotKey, body: page.body, contentType: page.contentType ?? "application/octet-stream", fetchedAt: now,
        meta: { url: evidence.url, final_url: safeUrl(page.finalUrl), http_status: page.status, source_name: evidence.sourceName },
      });
      snapshotId = stored.id;
    } catch (error) { note = `; snapshot not stored (${describeError(error)})`; }
  }
  const withSnapshot = { ...known, ...(snapshotId !== undefined ? { snapshotId } : {}) };

  if (type === "application/pdf") return make("fetch_failed", `pdf_not_parsed${note}`, withSnapshot);

  const html = decodeBody(page.body, page.contentType);
  const isHtml = type !== "text/plain";
  const text = isHtml ? htmlToText(html) : html.replace(/[ \t]+/g, " ").trim();
  const pageDate = isHtml ? extractPageDate(html) ?? undefined : undefined;
  const found = findQuote(text, wanted);
  if (!found) return make("quote_not_found", `quote not found in the page text${note}`, { ...withSnapshot, ...(pageDate ? { pageDate } : {}) });

  const claimed = toIsoDate(evidence.publishedAt);
  const dates = [pageDate, claimed ?? undefined].filter((d): d is string => !!d).sort();
  const used = dates[0]; // the older date wins
  const ageDays = used ? Math.floor(now.getTime() / DAY_MS - dayNumber(used)) : undefined;
  const extra = { ...withSnapshot, match: found.match, ...(pageDate ? { pageDate } : {}) };
  if (ageDays !== undefined && ageDays > STALE_DAYS) return make("stale", `source dated ${used} is ${ageDays} days old, limit is ${STALE_DAYS}${note}`, extra);

  let documentId: number | undefined;
  if (deps.documents) {
    try {
      const body = clip(text, MAX_DOCUMENT_BYTES);
      const h = page.finalUrl.hostname;
      const sourceClass = classifyHost(h, deps.irDomains ?? (deps.symbol ? irDomainsFor(deps.symbol) : []));
      const stored = await deps.documents.upsertDocument({
        source: sourceId, sourceId, symbol: deps.symbol ?? null, docType: "research_page", url: canonical,
        publishedAt: `${used ?? now.toISOString().slice(0, 10)}T00:00:00Z`, body,
        contentHash: createHash("sha256").update(body).digest("hex"),
        meta: { display_allowed: displayQuoteAllowed(h, sourceClass), source_class: sourceClass, source_name: evidence.sourceName, snapshot_id: snapshotId ?? null },
      });
      documentId = stored.id;
    } catch (error) { note += `; document not stored (${describeError(error)})`; }
  }
  return make("verified", [`quote found (${found.match})`, used ? `dated ${used}` : "no date on the page or in the claim"].join("; ") + note, {
    ...extra, ...(documentId !== undefined ? { documentId } : {}), readingLabel: READING_LABEL,
  });
}

/** Registrable domain, a cheap stand-in for "publisher": two hosts of one site count once. */
export function publisherKey(url: string): string {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""); } catch { return "invalid"; }
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const secondLevel = labels[labels.length - 2].length <= 3 && labels[labels.length - 1].length === 2;
  return labels.slice(secondLevel ? -3 : -2).join(".");
}

/** Closest to verified first. A finding without a passing item carries the best of these. */
const FAILURE_ORDER: readonly ItemStatus[] = ["stale", "quote_not_found", "fetch_failed", "blocked"];

/**
 * Grades one finding from its items. Status: verified when an item passed (lead_only when every passing item is social),
 * else the closest failure. confirmed: one verified primary item, or verified press items from two publishers.
 */
export function gradeFinding(items: ItemResult[]): FindingResult {
  const verified = items.filter((item) => item.status === "verified");
  const best = (list: ItemResult[]) => list.reduce<ItemResult | null>((top, item) => (!top || CLASS_RANK[item.sourceClass] > CLASS_RANK[top.sourceClass] ? item : top), null);
  const solid = verified.filter((item) => item.sourceClass !== "social");
  let status: VerificationStatus;
  if (verified.length) status = solid.length ? "verified" : "lead_only";
  else status = FAILURE_ORDER.find((s) => items.some((item) => item.status === s)) ?? "fetch_failed";
  const pressPublishers = new Set(verified.filter((item) => item.sourceClass === "press").map((item) => publisherKey(item.canonicalUrl ?? item.url)));
  const confirmed = verified.some((item) => item.sourceClass === "primary") || pressPublishers.size >= 2;
  const top = best(solid.length ? solid : verified.length ? verified : items);
  return {
    status, confirmed, sourceClass: top?.sourceClass ?? null, sourceId: top?.dataSourceId ?? null,
    snapshotId: top?.snapshotId ?? null, documentId: top?.documentId ?? null,
    readingLabel: verified.length ? READING_LABEL : null, displayQuote: verified.some((item) => item.displayQuote), items,
  };
}

/** Verifies every evidence item in order (so per-host delays hold) and grades the finding. */
export async function verifyFinding(finding: { symbol: string; evidence: ResearchEvidence[] }, deps: VerifyDeps = {}): Promise<FindingResult> {
  const items: ItemResult[] = [];
  for (const evidence of finding.evidence) items.push(await verifyEvidence(evidence, { ...deps, symbol: deps.symbol ?? finding.symbol }));
  return gradeFinding(items);
}
