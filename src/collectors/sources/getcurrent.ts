import { XMLParser } from "fast-xml-parser";
import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, PING_REQUEST, runPing, sourceDocument, type PendingFact, type PingResult, type SourceContext, type SourceOutput, type Env } from "./common";
import { loadTickers, universeByCik } from "./sec";
import { filingUrl, parseHolderOwnership } from "../edgar";

/** The type filter on getcurrent is a prefix match, so "SCHEDULE 13D" also returns 13D/A. */
export const FEED_TYPES = ["SCHEDULE 13D", "SCHEDULE 13G", "8-K"] as const;
export const feedUrl = (type: string, count = 100, start = 0) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(type)}&company=&dateb=&owner=include&start=${start}&count=${count}&output=atom`;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
const many = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

export interface FeedFiling { accession: string; form: string; filed: string; url: string; issuer?: { cik: number; name: string }; filer?: { cik: number; name: string } }

/** One accession appears once per party. Merge them: Subject is the issuer, "Filed by" is the holder. 8-K lists the company once as Filer. */
export function parseFeed(xml: string): FeedFiling[] {
  const feed = parser.parse(xml).feed;
  const byAccession = new Map<string, FeedFiling>();
  for (const entry of many<Record<string, unknown>>(feed?.entry)) {
    const title = String(entry.title ?? "");
    const match = /^(.+?) - (.+) \((\d{10})\) \((Subject|Issuer|Filed by|Filer|Reporting)\)\s*$/.exec(title);
    const id = /accession-number=(\d{10}-\d{2}-\d{6})/.exec(String(entry.id ?? ""))?.[1];
    if (!match || !id) continue;
    const [, form, name, cik, role] = match;
    const link = String((entry.link as { "@_href"?: string } | undefined)?.["@_href"] ?? "");
    const summary = String(entry.summary && typeof entry.summary === "object" ? (entry.summary as Record<string, unknown>)["#text"] ?? "" : entry.summary ?? "");
    const filed = /Filed:\W*(\d{4}-\d{2}-\d{2})/.exec(summary.replace(/<[^>]*>/g, " "))?.[1] ?? String(entry.updated ?? "").slice(0, 10);
    const row = byAccession.get(id) ?? { accession: id, form, filed, url: "" };
    const party = { cik: Number(cik), name };
    if (role === "Filed by" || role === "Reporting") row.filer = party; else row.issuer = party;
    if (link.startsWith("https://") && (!row.url || role !== "Filed by")) row.url = link;
    byAccession.set(id, row);
  }
  return [...byAccession.values()].filter((row) => row.url && /^\d{4}-\d{2}-\d{2}$/.test(row.filed));
}

/** SEC's Atom feed has no ownership fields. Read only a filing's primary document for named structured fields. */
async function ownershipFromFiling(filing: FeedFiling, http: SourceHttp) {
  const empty = { percent: null, shares: null };
  try {
  const base = new URL("./", filing.url).toString();
  const index = JSON.parse(await http.get(`${base}index.json`, { maxBytes: 500_000 })) as { directory?: { item?: { name: string; type?: string }[] } };
  const expected = filing.form.replace(/^SCHEDULE /, "(?:SC|SCHEDULE)\\s*");
  const primary = index.directory?.item?.find((item) => new RegExp(`^${expected}$`, "i").test(item.type?.trim() ?? ""));
  if (!primary) return empty;
  const body = await http.get(filingUrl(base, primary.name), { maxBytes: 1_000_000 });
  return parseHolderOwnership(body);
  } catch { return empty; } // percent and shares stay null when the filing cannot be read
}

export async function collectGetcurrent(ctx: SourceContext): Promise<SourceOutput> {
  const universe = universeByCik(ctx.companies, await loadTickers(ctx.http));
  const documents: CollectedDocument[] = [];
  const holderEvents: NonNullable<SourceOutput["holderEvents"]> = [];
  const events = new Map<string, { asOf: string; symbol: string; urls: string[]; items: { form: string; holder: string | null; accession: string }[] }>();
  const seen = new Set<string>();
  for (const type of FEED_TYPES) {
    for (let page = 0; page < 25; page++) {
      const batch = parseFeed(await ctx.http.get(feedUrl(type, 100, page * 100)));
      if (!batch.length || batch.every((filing) => filing.filed < ctx.since)) break;
      for (const filing of batch) {
        const symbol = filing.issuer ? universe.get(filing.issuer.cik) : undefined;
        if (!symbol || !ctx.symbols.includes(symbol) || filing.filed < ctx.since || seen.has(filing.accession)) continue;
        seen.add(filing.accession);
        const holder = filing.filer?.name ?? null;
        const is13 = /^SCHEDULE 13[DG]/.test(filing.form);
        if (is13) {
          const ownership = await ownershipFromFiling(filing, ctx.http);
          holderEvents.push({ accession: filing.accession, ticker: symbol, filerName: holder, filerCik: filing.filer?.cik ?? null,
            form: filing.form, filedAt: filing.filed, ...ownership });
        }
        documents.push(sourceDocument({ source: "sec-getcurrent", symbol, docType: filing.form, url: filing.url, publishedAt: `${filing.filed}T00:00:00Z`,
          body: is13 ? `${filing.form} filed ${filing.filed}${holder ? ` by ${holder}` : ""} for ${filing.issuer!.name} (${symbol}). Accession ${filing.accession}.`
            : `${filing.form} filed ${filing.filed} by ${filing.issuer!.name} (${symbol}). Accession ${filing.accession}. Items are not in the feed; see the filing.`,
          meta: { accession: filing.accession, form: filing.form, holder, issuerCik: filing.issuer!.cik, signal: is13 ? "new 5 percent holder event" : "8-K filed" } }, LICENSES.sec));
        if (is13) {
          const key = `${symbol}:${filing.filed}`;
          const event = events.get(key) ?? { asOf: filing.filed, symbol, urls: [], items: [] };
          event.urls.push(filing.url);
          event.items.push({ form: filing.form, holder, accession: filing.accession });
          events.set(key, event);
        }
      }
      if (batch.length < 100) break;
      if (page === 24) throw new Error(`${type} feed exceeded 25 pages; narrow --since to avoid missing filings`);
    }
  }
  const facts: PendingFact[] = [...events.values()].map((event) => ({ symbol: event.symbol, key: "holder_5pct_events", asOf: event.asOf, documentUrls: event.urls, value: { count: event.items.length, events: event.items } }));
  return { documents, facts, holderEvents };
}

export const ping = (http: SourceHttp = defaultHttp(), env: Env = process.env): Promise<PingResult> => runPing("getcurrent", async () => {
  const filings = parseFeed(await http.get(feedUrl("SCHEDULE 13G", 5), PING_REQUEST));
  if (!filings.length) throw new Error("feed parsed but has no usable entries");
  return `${filings.length} filings, newest ${filings[0].form} ${filings[0].filed}`;
}, { sec: true, env });
