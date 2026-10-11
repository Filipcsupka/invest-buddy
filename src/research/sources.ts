import type { SourceClass } from "./types";
import registry from "./sources.json";

/** Source classes and data_sources ids for the research verifier (RS2). Host lists live in sources.json. */
export const RESEARCH_SOURCE_ID = "research_web";

interface Registry {
  primary: string[];
  press: string[];
  aggregator: string[];
  social: string[];
  dataSources: Record<string, string>;
  ir: Record<string, string[]>;
}
const lists = registry as unknown as Registry;

/** data_sources ids whose rows allow display (migration 022). Quotes from other sources are never shown. */
const DISPLAY_SOURCES: ReadonlySet<string> = new Set(["sec", "usaspending", "openfda"]);

const cleanHost = (host: string) => host.toLowerCase().replace(/\.$/, "");

/** True when the host is the domain or a subdomain of it. */
export const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const inList = (host: string, list: readonly string[]) => list.some((domain) => hostMatches(host, domain));

/** Company IR hosts for a symbol, from the registry seeded with the IR links in discovery-themes.json. */
export function irDomainsFor(symbol: string): string[] {
  return lists.ir[symbol.toUpperCase()] ?? [];
}

/**
 * Class of a host, decided from the host and never from the model's hint. Social is checked first so a social
 * subdomain of a listed domain cannot rise. A host that is not on any list is an aggregator.
 * `irDomains` are the confirmed IR domains of the finding's company; a look-alike domain does not match.
 */
export function classifyHost(hostname: string, irDomains: Iterable<string> = []): SourceClass {
  const host = cleanHost(hostname);
  if (inList(host, lists.social)) return "social";
  if (inList(host, lists.primary)) return "primary";
  if ([...irDomains].some((domain) => hostMatches(host, cleanHost(domain)))) return "primary";
  if (inList(host, lists.press)) return "press";
  return "aggregator";
}

/** `data_sources` id for a host: sec, openfda, clinicaltrials, usaspending, else research_web. */
export function dataSourceIdFor(hostname: string): string {
  const host = cleanHost(hostname);
  const entry = Object.entries(lists.dataSources).find(([domain]) => hostMatches(host, domain));
  return entry ? entry[1] : RESEARCH_SOURCE_ID;
}

/** A quote may be shown only for a primary source whose data_sources row allows display (SEC, openFDA, USAspending). */
export function displayQuoteAllowed(hostname: string, sourceClass: SourceClass): boolean {
  return sourceClass === "primary" && DISPLAY_SOURCES.has(dataSourceIdFor(hostname));
}

/** Strongest first, for picking the best class of a finding. */
export const CLASS_RANK: Readonly<Record<SourceClass, number>> = { primary: 3, press: 2, aggregator: 1, social: 0 };
