import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryCusipStore } from "../../db/source-collectors";
import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { isDate, LICENSES, PING_REQUEST, round, runPing, sourceDocument, type PendingFact, type PingResult, type SourceContext, type SourceOutput, type Env } from "./common";
import { resolveUniverseCusips } from "./openfigi";
import { loadTickers, universeByCik } from "./sec";
import { listZip, tsvRows } from "./zip";

export const DATASETS_PAGE = "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets";
/** Hard stops so a surprise file cannot fill the disk or the pod. */
export const MAX_ZIP_BYTES = 1.5 * 1024 ** 3;
export const MAX_CANDIDATE_CUSIPS = 400;
export const MIN_HOLDERS_FOR_PERIOD = 50;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface DatasetLink { url: string; file: string; end: string }
/** Reads the zip links from the data sets page. URLs are never guessed: the file names rotate with the filing window. */
export function parseDatasetLinks(html: string, pageUrl = DATASETS_PAGE): DatasetLink[] {
  const links: DatasetLink[] = [];
  for (const match of html.matchAll(/href="([^"]*?([^"/]+_form13f\.zip))"/gi)) {
    const url = new URL(match[1].replace(/&amp;/g, "&"), pageUrl);
    if (url.protocol !== "https:" || !(url.hostname === "www.sec.gov" || url.hostname === "sec.gov")) continue;
    const file = match[2];
    const range = /^(\d{2})([a-z]{3})(\d{4})-(\d{2})([a-z]{3})(\d{4})_form13f\.zip$/i.exec(file);
    const quarter = /^(\d{4})q([1-4])_form13f\.zip$/i.exec(file);
    let end: string | undefined;
    if (range && MONTHS.includes(range[5].toLowerCase())) end = `${range[6]}-${String(MONTHS.indexOf(range[5].toLowerCase()) + 1).padStart(2, "0")}-${range[4]}`;
    else if (quarter) end = `${quarter[1]}-${String(Number(quarter[2]) * 3).padStart(2, "0")}-28`;
    if (end && isDate(end) && !links.some((link) => link.url === url.toString())) links.push({ url: url.toString(), file, end });
  }
  return links.sort((a, b) => b.end.localeCompare(a.end));
}

const SUFFIXES = new Set(["INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC", "HOLDINGS", "HLDGS", "GROUP", "THE", "NV", "SA", "AG", "LP", "CL", "CLASS", "COM", "ORD", "ADR", "SHS", "A", "B", "C", "NEW"]);
export function normalizeIssuer(name: string): string {
  return name.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((word) => word && !SUFFIXES.has(word)).join(" ");
}

/** Name prefilter: which universe symbols could an INFOTABLE issuer name belong to. OpenFIGI makes the final decision. */
export function issuerMatcher(names: Map<string, string>) {
  const index = new Map<string, { symbol: string; normalized: string }[]>();
  for (const [symbol, name] of names) {
    const normalized = normalizeIssuer(name);
    if (!normalized) continue;
    const first = normalized.split(" ")[0];
    index.set(first, [...(index.get(first) ?? []), { symbol, normalized }]);
  }
  const cache = new Map<string, boolean>();
  return (issuer: string): boolean => {
    const cached = cache.get(issuer);
    if (cached !== undefined) return cached;
    const normalized = normalizeIssuer(issuer);
    const hit = (index.get(normalized.split(" ")[0]) ?? []).some((entry) => normalized === entry.normalized || normalized.startsWith(`${entry.normalized} `));
    if (cache.size < 200_000) cache.set(issuer, hit);
    return hit;
  };
}

/** "30-JUN-2026" to 2026-06-30. */
export function reportPeriod(value: string): string | undefined {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (match && MONTHS.includes(match[2].toLowerCase())) return `${match[3]}-${String(MONTHS.indexOf(match[2].toLowerCase()) + 1).padStart(2, "0")}-${match[1]}`;
  return isDate(value.trim()) ? value.trim() : undefined;
}

export interface Aggregate { holders: Set<string>; shares: number; value: number; names: Set<string> }
export interface ScanResult { candidates: Map<string, Map<string, Aggregate>>; filings: number; rows: number; capped: boolean }

/** One pass over the zip. Memory is bounded by the candidate CUSIPs (name matches only), not by the file size. */
export async function scanDataset(zip: string, matches: (issuer: string) => boolean): Promise<ScanResult> {
  const entries = await listZip(zip);
  const find = (name: string) => { const entry = entries.find((item) => item.name.toUpperCase().endsWith(name)); if (!entry) throw new Error(`13F zip has no ${name}`); return entry; };
  const filings = new Map<string, string>();
  for await (const row of tsvRows(zip, find("SUBMISSION.TSV"))) {
    const period = reportPeriod(row.PERIODOFREPORT ?? "");
    if (row.SUBMISSIONTYPE === "13F-HR" && period && row.ACCESSION_NUMBER) filings.set(row.ACCESSION_NUMBER, period);
  }
  const candidates = new Map<string, Map<string, Aggregate>>();
  let rows = 0, capped = false;
  for await (const row of tsvRows(zip, find("INFOTABLE.TSV"))) {
    rows++;
    const period = filings.get(row.ACCESSION_NUMBER);
    if (!period || row.PUTCALL || (row.SSHPRNAMTTYPE && row.SSHPRNAMTTYPE !== "SH")) continue;
    const cusip = (row.CUSIP ?? "").toUpperCase();
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !matches(row.NAMEOFISSUER ?? "")) continue;
    let periods = candidates.get(cusip);
    if (!periods) {
      if (candidates.size >= MAX_CANDIDATE_CUSIPS) { capped = true; continue; }
      periods = new Map();
      candidates.set(cusip, periods);
    }
    const aggregate = periods.get(period) ?? { holders: new Set<string>(), shares: 0, value: 0, names: new Set<string>() };
    aggregate.holders.add(row.ACCESSION_NUMBER);
    aggregate.shares += Number(row.SSHPRNAMT) || 0;
    aggregate.value += Number(row.VALUE) || 0;
    if (aggregate.names.size < 3) aggregate.names.add(row.NAMEOFISSUER);
    periods.set(period, aggregate);
  }
  return { candidates, filings: filings.size, rows, capped };
}

export interface Holdings { symbol: string; period: string; holders: number; shares: number; valueUsd: number; cusips: string[] }
/** Per symbol, the latest period that has a real number of filers. Late filers for an older period are ignored. */
export function summarise(candidates: ScanResult["candidates"], symbolOf: Map<string, string>): Holdings[] {
  const perSymbol = new Map<string, Map<string, { holders: Set<string>; shares: number; value: number; cusips: Set<string> }>>();
  for (const [cusip, periods] of candidates) {
    const symbol = symbolOf.get(cusip);
    if (!symbol) continue;
    const target = perSymbol.get(symbol) ?? new Map();
    for (const [period, aggregate] of periods) {
      const sum = target.get(period) ?? { holders: new Set<string>(), shares: 0, value: 0, cusips: new Set<string>() };
      for (const holder of aggregate.holders) sum.holders.add(holder);
      sum.shares += aggregate.shares; sum.value += aggregate.value; sum.cusips.add(cusip);
      target.set(period, sum);
    }
    perSymbol.set(symbol, target);
  }
  const out: Holdings[] = [];
  for (const [symbol, periods] of perSymbol) {
    const ordered = [...periods].sort((a, b) => b[0].localeCompare(a[0]));
    const chosen = ordered.find(([, sum]) => sum.holders.size >= MIN_HOLDERS_FOR_PERIOD) ?? ordered.sort((a, b) => b[1].holders.size - a[1].holders.size)[0];
    if (chosen) out.push({ symbol, period: chosen[0], holders: chosen[1].holders.size, shares: chosen[1].shares, valueUsd: round(chosen[1].value, 0), cusips: [...chosen[1].cusips].sort() });
  }
  return out;
}

export async function collect13f(ctx: SourceContext): Promise<SourceOutput> {
  const page = await ctx.http.get(DATASETS_PAGE);
  const [dataset] = parseDatasetLinks(page);
  if (!dataset) throw new Error("13F data sets page has no form13f.zip link");
  const tickers = await loadTickers(ctx.http);
  const names = new Map<string, string>();
  for (const [cik, symbol] of universeByCik(ctx.companies, tickers)) if (ctx.symbols.includes(symbol)) names.set(symbol, tickers.byCik.get(cik)?.title || ctx.companies.find((company) => company.symbol === symbol)?.name || symbol);
  if (!names.size) return { documents: [], facts: [] };

  const directory = await mkdtemp(join(tmpdir(), "13f-"));
  const zip = join(directory, dataset.file);
  try {
    await ctx.http.download(dataset.url, zip, { maxBytes: MAX_ZIP_BYTES });
    const scan = await scanDataset(zip, issuerMatcher(names));
    const store = ctx.cusips ?? new MemoryCusipStore(() => ctx.now);
    const symbolOf = await resolveUniverseCusips(ctx.http, store, [...scan.candidates.keys()], ctx.companies.filter((company) => names.has(company.symbol)), ctx.now);
    const documents: CollectedDocument[] = [], facts: PendingFact[] = [];
    for (const holdings of summarise(scan.candidates, symbolOf)) {
      const url = `${dataset.url}#${holdings.symbol}-${holdings.period}`;
      documents.push(sourceDocument({ source: "sec-13f", symbol: holdings.symbol, docType: "13F holdings summary", url, publishedAt: `${holdings.period}T00:00:00Z`,
        body: `${holdings.symbol} Form 13F-HR holdings for the quarter ended ${holdings.period}, from data set ${dataset.file}: ${holdings.holders} filers hold ${holdings.shares} shares, reported value $${holdings.valueUsd}. Options and non-share positions excluded.`,
        meta: { dataset: dataset.file, period: holdings.period, holders: holdings.holders, shares: holdings.shares, valueUsd: holdings.valueUsd, cusips: holdings.cusips, filingsInDataset: scan.filings, candidateCusipsCapped: scan.capped } }, LICENSES.sec));
      facts.push({ symbol: holdings.symbol, key: "institutional_13f", asOf: holdings.period, documentUrls: [url],
        value: { dataset: dataset.file, period: holdings.period, holders: holdings.holders, shares: holdings.shares, valueUsd: holdings.valueUsd } });
    }
    return { documents, facts };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export const ping = (http: SourceHttp = defaultHttp(), env: Env = process.env): Promise<PingResult> => runPing("13f", async () => {
  const links = parseDatasetLinks(await http.get(DATASETS_PAGE, PING_REQUEST));
  if (!links.length) throw new Error("page parsed but has no form13f.zip link");
  return `${links.length} data sets, latest ${links[0].file}`;
}, { sec: true, env });
