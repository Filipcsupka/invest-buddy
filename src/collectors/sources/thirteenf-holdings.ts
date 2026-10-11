import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRACKED_INSTITUTIONS, type TrackedInstitution } from "../../data/tracked-institutions";
import type { HoldingRow, InstitutionalStore, FilingRow } from "../../db/institutional";
import type { CusipStore } from "../../db/source-collectors";
import type { CollectedDocument } from "../types";
import type { SourceHttp } from "./client";
import { isDate, LICENSES, round, sourceDocument, type Company, type PendingFact } from "./common";
import { resolveUniverseCusips } from "./openfigi";
import { loadTickers, universeByCik } from "./sec";
import { DATASETS_PAGE, issuerMatcher, MAX_ZIP_BYTES, parseDatasetLinks, reportPeriod } from "./thirteenf";
import { listZip, tsvRows } from "./zip";

export const NET_CHANGE_FACT = "institutional_net_change";
/** 45-day filing deadline, one quarter and slack: the fact is stale once the next quarter's filings should be in. */
const FACT_LIFETIME_DAYS = 150;

export interface FilerPosition { shares: number; value: number }
export interface FilerFiling { accession: string; cusips: Map<string, FilerPosition> }
export interface FilerScan { periods: Map<string, Map<number, FilerFiling>>; rows: number }

const dateOf = (value: string | undefined) => reportPeriod(value ?? "") ?? "";

/** One pass over the zip for tracked filers only. Memory is bounded by their name-matched universe positions. */
export async function scanFilers(zip: string, tracked: readonly TrackedInstitution[], matches: (issuer: string) => boolean): Promise<FilerScan> {
  const entries = await listZip(zip);
  const find = (name: string) => { const entry = entries.find((item) => item.name.toUpperCase().endsWith(name)); if (!entry) throw new Error(`13F zip has no ${name}`); return entry; };
  const wanted = new Set(tracked.map((filer) => filer.cik));
  const byAccession = new Map<string, { period: string; cik: number }>();
  const newest = new Map<string, { accession: string; filed: string }>();
  for await (const row of tsvRows(zip, find("SUBMISSION.TSV"))) {
    const period = reportPeriod(row.PERIODOFREPORT ?? ""), cik = Number(row.CIK);
    // Amendments (13F-HR/A) are ignored: they can restate part of a filing and would need merging.
    if (row.SUBMISSIONTYPE !== "13F-HR" || !period || !wanted.has(cik) || !row.ACCESSION_NUMBER) continue;
    const key = `${period}:${cik}`, filed = dateOf(row.FILING_DATE);
    const current = newest.get(key);
    if (current && current.filed >= filed) continue;
    newest.set(key, { accession: row.ACCESSION_NUMBER, filed });
    byAccession.set(row.ACCESSION_NUMBER, { period, cik });
  }
  const live = new Set([...newest.values()].map((item) => item.accession));
  const periods = new Map<string, Map<number, FilerFiling>>();
  for (const [accession, { period, cik }] of byAccession) {
    if (!live.has(accession)) continue;
    const filers = periods.get(period) ?? new Map<number, FilerFiling>();
    filers.set(cik, { accession, cusips: new Map() });
    periods.set(period, filers);
  }
  let rows = 0;
  for await (const row of tsvRows(zip, find("INFOTABLE.TSV"))) {
    rows++;
    const owner = byAccession.get(row.ACCESSION_NUMBER);
    if (!owner || !live.has(row.ACCESSION_NUMBER) || row.PUTCALL || (row.SSHPRNAMTTYPE && row.SSHPRNAMTTYPE !== "SH")) continue;
    const cusip = (row.CUSIP ?? "").toUpperCase();
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !matches(row.NAMEOFISSUER ?? "")) continue;
    const filing = periods.get(owner.period)!.get(owner.cik)!;
    const position = filing.cusips.get(cusip) ?? { shares: 0, value: 0 };
    position.shares += Number(row.SSHPRNAMT) || 0;
    position.value += Number(row.VALUE) || 0;
    filing.cusips.set(cusip, position);
  }
  return { periods, rows };
}

/** The quarter with the most tracked filers; a later one wins a tie. Late filers for older quarters are left for their own run. */
export function chooseScanPeriod(scan: FilerScan, wanted?: string): string | undefined {
  if (wanted) return scan.periods.has(wanted) ? wanted : undefined;
  return [...scan.periods].sort((a, b) => b[1].size - a[1].size || b[0].localeCompare(a[0]))[0]?.[0];
}

export type Prior = { period: string; shares: Map<string, number> } | undefined;

/**
 * Rows for one filing. `changeShares` compares with the same filer's previous stored quarter; a filer with no earlier
 * stored filing gets null (no baseline), not its whole position as a purchase. A position that disappeared is stored with 0 shares.
 */
export function holdingRows(period: string, filer: TrackedInstitution, filing: FilerFiling, symbolOf: Map<string, string>, prior: Prior): HoldingRow[] {
  const current = new Map<string, { shares: number; value: number }>();
  for (const [cusip, position] of filing.cusips) {
    const ticker = symbolOf.get(cusip);
    if (!ticker) continue;
    const sum = current.get(ticker) ?? { shares: 0, value: 0 };
    sum.shares += position.shares; sum.value += position.value;
    current.set(ticker, sum);
  }
  const tickers = new Set(current.keys());
  if (prior) for (const [ticker, shares] of prior.shares) if (shares > 0) tickers.add(ticker);
  return [...tickers].sort().map((ticker) => {
    const now = current.get(ticker) ?? { shares: 0, value: 0 };
    return { period, filerCik: filer.cik, filerName: filer.name, ticker, shares: now.shares, valueUsd: round(now.value, 0),
      changeShares: prior ? now.shares - (prior.shares.get(ticker) ?? 0) : null, priorPeriod: prior?.period ?? null };
  });
}

export interface NetChange { ticker: string; period: string; holders: number; shares: number; valueUsd: number; compared: number; netChangeShares: number; increased: number; decreased: number; opened: number; closed: number; priorPeriods: string[]; filers: { cik: number; name: string; accession: string }[] }
/** Per ticker, over filers that have a baseline. null when no filer has one (first stored quarter). */
export function netChanges(rows: HoldingRow[], accessions: Map<number, string>): NetChange[] {
  const byTicker = new Map<string, HoldingRow[]>();
  for (const row of rows) byTicker.set(row.ticker, [...(byTicker.get(row.ticker) ?? []), row]);
  const out: NetChange[] = [];
  for (const [ticker, list] of byTicker) {
    const compared = list.filter((row) => row.changeShares !== null);
    if (!compared.length) continue;
    const change = (row: HoldingRow) => row.changeShares as number;
    out.push({ ticker, period: list[0].period, holders: list.filter((row) => row.shares > 0).length, shares: list.reduce((n, row) => n + row.shares, 0), valueUsd: list.reduce((n, row) => n + row.valueUsd, 0),
      compared: compared.length, netChangeShares: compared.reduce((n, row) => n + change(row), 0),
      increased: compared.filter((row) => change(row) > 0).length, decreased: compared.filter((row) => change(row) < 0).length,
      opened: compared.filter((row) => row.shares - change(row) === 0 && row.shares > 0).length, closed: compared.filter((row) => row.shares === 0 && change(row) < 0).length,
      priorPeriods: [...new Set(compared.map((row) => row.priorPeriod as string))].sort(),
      filers: list.map((row) => ({ cik: row.filerCik, name: row.filerName, accession: accessions.get(row.filerCik) ?? "" })) });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export interface ThirteenFOptions {
  http: SourceHttp;
  store: InstitutionalStore;
  cusips: CusipStore;
  companies: Company[];
  now: Date;
  dryRun: boolean;
  /** Local data set zip (fixture or a file already on disk). It is never deleted. Without it the newest zip is downloaded and deleted afterwards. */
  zipPath?: string;
  period?: string;
  tracked?: readonly TrackedInstitution[];
  maxZipBytes?: number;
}
export interface ThirteenFResult { dataset: string; period: string | null; filersFound: number; filersNew: number; rowsAdded: number; documents: CollectedDocument[]; facts: PendingFact[]; skipped?: string }

/** Reads the data set, stores per-filer rows for universe tickers and returns the documents and facts for the runner to store. Writes nothing when dryRun. */
export async function runThirteenF(options: ThirteenFOptions): Promise<ThirteenFResult> {
  const tracked = options.tracked ?? TRACKED_INSTITUTIONS;
  const empty = (dataset: string, skipped: string): ThirteenFResult => ({ dataset, period: null, filersFound: 0, filersNew: 0, rowsAdded: 0, documents: [], facts: [], skipped });
  const universe = new Set(options.companies.map((company) => company.symbol));
  const names = new Map<string, string>();
  const tickers = await loadTickers(options.http);
  for (const [cik, symbol] of universeByCik(options.companies, tickers)) if (universe.has(symbol)) names.set(symbol, tickers.byCik.get(cik)?.title || options.companies.find((company) => company.symbol === symbol)?.name || symbol);
  if (!names.size) return empty("none", "no universe issuer names");

  let directory: string | undefined, zip = options.zipPath, dataset = options.zipPath ? options.zipPath.split("/").pop()! : "";
  let datasetUrl = `file:${dataset}`;
  try {
    if (!zip) {
      const [link] = parseDatasetLinks(await options.http.get(DATASETS_PAGE));
      if (!link) throw new Error("13F data sets page has no form13f.zip link");
      directory = await mkdtemp(join(tmpdir(), "13f-"));
      zip = join(directory, link.file); dataset = link.file; datasetUrl = link.url;
      await options.http.download(link.url, zip, { maxBytes: options.maxZipBytes ?? MAX_ZIP_BYTES });
    }
    const scan = await scanFilers(zip, tracked, issuerMatcher(names));
    const period = chooseScanPeriod(scan, options.period);
    if (!period || !isDate(period)) return empty(dataset, "no 13F-HR from tracked filers in the data set");
    const filings = scan.periods.get(period)!;
    const fresh: [TrackedInstitution, FilerFiling][] = [];
    for (const filer of tracked) {
      const filing = filings.get(filer.cik);
      if (filing && !(await options.store.hasFiling(period, filer.cik))) fresh.push([filer, filing]);
    }
    const result: ThirteenFResult = { dataset, period, filersFound: filings.size, filersNew: fresh.length, rowsAdded: 0, documents: [], facts: [] };
    if (!fresh.length) return { ...result, skipped: "all tracked filings for the quarter are already stored" };

    const candidates = [...new Set(fresh.flatMap(([, filing]) => [...filing.cusips.keys()]))];
    const symbolOf = await resolveUniverseCusips(options.http, options.cusips, candidates, options.companies.filter((company) => names.has(company.symbol)), options.now);
    const priors = await options.store.priorFilings(period, fresh.map(([filer]) => filer.cik));
    const rows: HoldingRow[] = [], accessions = new Map<number, string>();
    for (const [filer, filing] of fresh) {
      const filerRows = holdingRows(period, filer, filing, symbolOf, priors.get(filer.cik));
      accessions.set(filer.cik, filing.accession);
      const header: FilingRow = { period, filerCik: filer.cik, filerName: filer.name, accession: filing.accession };
      if (!options.dryRun) result.rowsAdded += await options.store.addFiling(header, filerRows);
      else result.rowsAdded += filerRows.length;
      rows.push(...filerRows);
    }
    for (const change of netChanges(rows, accessions)) {
      const url = `${datasetUrl}#institutional-${change.ticker}-${period}`;
      const filingLinks = change.filers.map((filer) => ({ filer: filer.name, cik: filer.cik, accession: filer.accession, url: `https://www.sec.gov/Archives/edgar/data/${filer.cik}/${filer.accession.replace(/-/g, "")}/` }));
      const value = { dataset, period, priorPeriods: change.priorPeriods, filersCompared: change.compared, netChangeShares: change.netChangeShares, increased: change.increased, decreased: change.decreased, opened: change.opened, closed: change.closed, holders: change.holders, shares: change.shares, valueUsd: change.valueUsd };
      result.documents.push(sourceDocument({ source: "sec-13f", symbol: change.ticker, docType: "13F holdings change", url, publishedAt: `${period}T00:00:00Z`,
        body: `${change.ticker} Form 13F-HR quarter ended ${period}, ${change.compared} tracked filers compared with their previous stored quarter: net change ${change.netChangeShares} shares (${change.increased} up, ${change.decreased} down, ${change.opened} new, ${change.closed} closed). ${change.holders} tracked filers hold ${change.shares} shares, reported value $${change.valueUsd}. Options and non-share positions excluded.`,
        meta: { ...value, filings: filingLinks } }, LICENSES.sec));
      result.facts.push({ symbol: change.ticker, key: NET_CHANGE_FACT, asOf: period, value, documentUrls: [url],
        expiresAt: new Date(Date.parse(`${period}T00:00:00Z`) + FACT_LIFETIME_DAYS * 86_400_000).toISOString() });
    }
    return result;
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}
