import { BodyTooLarge, decodeBody, guardedGet, mediaType, RobotsDisallowed, safeUrl, UrlBlocked, type GuardDeps, type GuardedPage } from "./fetch-guard";
import { extractPageDate, findQuote, htmlToText, normalizeText, toIsoDate } from "./html-text";
import { classifyHost, dataSourceIdFor, displayQuoteAllowed, irDomainsFor, RESEARCH_SOURCE_ID } from "./sources";
import type { Evidence, ItemStatus, SourceClass } from "./types";

/** A source older than this many days before the check date is stale. */
export const STALE_DAYS = 90;
const DAY_MS = 86_400_000;

export interface ItemResult {
  url: string;
  status: ItemStatus;
  reason: string;
  /** Class from the host of the page that was read. */
  sourceClass: SourceClass;
  /** True when the hint differs from the class decided here. Logged, never used. */
  hintMismatch: boolean;
  dataSourceId: string;
  displayQuote: boolean;
  canonicalUrl?: string;
  pageDate?: string;
  match?: "exact" | "fuzzy";
  publisher?: string;
}

export interface VerifyDeps extends GuardDeps {
  /** Company IR domains. Defaults to the registry entry for `symbol`. */
  irDomains?: Iterable<string>;
  symbol?: string;
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/** URL used as the canonical key: no fragment, no tracking parameters, sorted query, lower-case host. */
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

/** Verifies one evidence item. Never throws for a bad source; the status says what happened. */
export async function verifyEvidence(evidence: Evidence, deps: VerifyDeps = {}): Promise<ItemResult> {
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

  let page: GuardedPage;
  try {
    page = await guardedGet(evidence.url, deps);
  } catch (error) {
    const reason = describeError(error);
    if (error instanceof UrlBlocked) return make("blocked", `blocked: ${reason}`);
    if (error instanceof RobotsDisallowed) return make("blocked", reason);
    if (error instanceof BodyTooLarge) return make("fetch_failed", `page is over the byte limit`);
    return make("fetch_failed", reason);
  }

  const known = { canonicalUrl: canonicalUrl(page.finalUrl) };
  const type = mediaType(page.contentType);
  if (type === "application/pdf") return make("fetch_failed", "pdf_not_parsed", known);

  const html = decodeBody(page.body, page.contentType);
  const isHtml = type !== "text/plain";
  const text = isHtml ? htmlToText(html) : html.replace(/[ \t]+/g, " ").trim();
  const pageDate = isHtml ? extractPageDate(html) ?? undefined : undefined;
  const found = findQuote(text, wanted);
  if (!found) return make("quote_not_found", "quote not found in the page text", { ...known, ...(pageDate ? { pageDate } : {}) });

  const claimed = toIsoDate(evidence.publishedAt);
  const dates = [pageDate, claimed ?? undefined].filter((d): d is string => !!d).sort();
  const used = dates[0]; // the older date wins
  const ageDays = used ? Math.floor(now.getTime() / DAY_MS - dayNumber(used)) : undefined;
  const extra = { ...known, match: found.match, ...(pageDate ? { pageDate } : {}) };
  if (ageDays !== undefined && ageDays > STALE_DAYS) return make("stale", `source dated ${used} is ${ageDays} days old, limit is ${STALE_DAYS}`, extra);
  return make("verified", [`quote found (${found.match})`, used ? `dated ${used}` : "no date on the page or in the claim"].join("; "), extra);
}
