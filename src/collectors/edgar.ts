import { XMLParser } from "fast-xml-parser";
import { type CollectedDocument } from "./types";
import { LICENSES, sourceDocument } from "./sources/common";
import { getText } from "./http";

type Get = (url: string) => Promise<string>;
type Recent = { form: string[]; accessionNumber: string[]; primaryDocument: string[]; filingDate: string[]; items?: string[] };
/** `dollars` is null when the filing gives no usable price (empty or footnoted price field). It is never counted as 0. */
export interface InsiderTrade { date: string; code: "P" | "S"; shares: number; dollars: number | null }
export interface Form4Transaction {
  lineNo: number; ownerCik: string | null; ownerName: string | null;
  reportingOwners: { cik: string | null; name: string | null; isDirector: boolean | null; isOfficer: boolean | null; isTenPercentOwner: boolean | null; isOther: boolean | null }[];
  isDirector: boolean | null; isOfficer: boolean | null; isTenPercentOwner: boolean | null; isOther: boolean | null;
  transactionDate: string; code: string; shares: number; price: number | null;
  acquiredDisposed: string | null; derivative: boolean; sharesAfter: number | null;
  plan10b5: "yes" | "no" | "unknown";
}
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const many = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const value = (node: unknown): string => String(typeof node === "string" || typeof node === "number" ? node : (node as { value?: unknown })?.value ?? "");

export function parseForm4(xml: string): InsiderTrade[] {
  const root = parser.parse(xml).ownershipDocument;
  const out: InsiderTrade[] = [];
  for (const owner of many(root?.nonDerivativeTable?.nonDerivativeTransaction)) {
    const code = value(owner.transactionCoding?.transactionCode);
    if (code !== "P" && code !== "S") continue;
    const shares = Number(value(owner.transactionAmounts?.transactionShares));
    const priceText = value(owner.transactionAmounts?.transactionPricePerShare).trim();
    const price = priceText === "" ? Number.NaN : Number(priceText);
    const date = value(owner.transactionDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(shares) && shares > 0) {
      out.push({ date, code, shares, dollars: Number.isFinite(price) && price >= 0 ? shares * price : null });
    }
  }
  return out;
}

export function form4OwnerCik(xml: string): string | null {
  const owner = parser.parse(xml).ownershipDocument?.reportingOwner?.reportingOwnerId?.rptOwnerCik;
  const cik = value(owner).trim();
  return /^\d+$/.test(cik) ? cik : null;
}

/** All transaction rows, including exercises and derivatives. Line numbers follow XML order within each table. */
export function parseForm4Transactions(xml: string): Form4Transaction[] {
  const root = parser.parse(xml).ownershipDocument;
  if (!root) return [];
  const owners = many(root.reportingOwner);
  const flag = (owner: typeof owners[number], field: string): boolean | null => {
    const raw = value(owner?.reportingOwnerRelationship?.[field]).trim();
    return raw === "1" || raw.toLowerCase() === "true" ? true : raw === "0" || raw.toLowerCase() === "false" ? false : null;
  };
  const reportingOwners = owners.map((owner) => ({ cik: value(owner?.reportingOwnerId?.rptOwnerCik).trim() || null,
    name: value(owner?.reportingOwnerId?.rptOwnerName).trim() || null,
    isDirector: flag(owner, "isDirector"), isOfficer: flag(owner, "isOfficer"),
    isTenPercentOwner: flag(owner, "isTenPercentOwner"), isOther: flag(owner, "isOther") }));
  const sole = reportingOwners.length === 1 ? reportingOwners[0] : undefined;
  const plan = value(root.aff10b5One).trim();
  const plan10b5 = plan === "1" || plan.toLowerCase() === "true" ? "yes" : plan === "0" || plan.toLowerCase() === "false" ? "no" : "unknown";
  const out: Form4Transaction[] = [];
  for (const [derivative, rows] of [[false, many(root.nonDerivativeTable?.nonDerivativeTransaction)], [true, many(root.derivativeTable?.derivativeTransaction)]] as const) {
    for (const [index, row] of rows.entries()) {
      const date = value(row.transactionDate);
      const sharesText = value(row.transactionAmounts?.transactionShares).trim();
      const shares = Number(sharesText);
      const code = value(row.transactionCoding?.transactionCode).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !sharesText || !Number.isFinite(shares) || shares <= 0 || !code) continue;
      const number = (node: unknown): number | null => {
        const raw = value(node).trim();
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      };
      out.push({ lineNo: (derivative ? 1000000 : 0) + index + 1, ownerCik: sole?.cik ?? null, ownerName: sole?.name ?? null, reportingOwners,
        isDirector: sole?.isDirector ?? null, isOfficer: sole?.isOfficer ?? null, isTenPercentOwner: sole?.isTenPercentOwner ?? null, isOther: sole?.isOther ?? null,
        transactionDate: date, code, shares, price: number(row.transactionAmounts?.transactionPricePerShare),
        acquiredDisposed: value(row.transactionAmounts?.transactionAcquiredDisposedCode).trim() || null,
        derivative, sharesAfter: number(row.postTransactionAmounts?.sharesOwnedFollowingTransaction), plan10b5 });
    }
  }
  return out;
}

export function filingRows(recent: Recent, since: string, form4Since = since) {
  return recent.form.map((form, i) => ({ form, accession: recent.accessionNumber[i], primary: recent.primaryDocument[i], date: recent.filingDate[i], items: recent.items?.[i] ?? "" }))
    .filter((row) => ["8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A", "4", "6-K", "20-F"].includes(row.form) && row.date >= (row.form === "4" ? (form4Since < since ? form4Since : since) : since) && ACCESSION.test(row.accession ?? "") && row.primary);
}

export async function companyCiks(get: Get = getText): Promise<Map<string, number>> {
  const rows = JSON.parse(await get("https://www.sec.gov/files/company_tickers.json")) as Record<string, { ticker: string; cik_str: number }>;
  return new Map(Object.values(rows).map((row) => [row.ticker.toUpperCase(), row.cik_str]));
}

/** Form 4 `primaryDocument` is normally `xslF345X05/<name>.xml`, which serves an HTML rendering. The raw XML sits next to it without the prefix. */
export const form4RawPath = (primary: string) => primary.replace(/^xsl[^/]*\//i, "");

/** Resolves a filing file name against the filing folder. Names come from remote JSON, so anything leaving the folder is refused. */
export function filingUrl(base: string, name: string): string {
  const url = new URL(name, base).toString();
  if (!url.startsWith(base)) throw new Error(`Filing file outside its folder: ${name.slice(0, 80)}`);
  return url;
}

/** Item 2.02 filings carry the earnings release as a second HTML file. Skips the primary document, XBRL viewer pages (R1.htm) and index pages; at most two. */
export function earningsExhibitNames(names: string[], primary: string, items: string): string[] {
  if (!items.split(/[,\s]+/).includes("2.02")) return [];
  return names.filter((name) => /\.html?$/i.test(name) && name !== primary && !/^R\d+\.htm$/i.test(name) && !/index|filingsummary|metalinks/i.test(name)).slice(0, 2);
}

export async function collectEdgar(symbol: string, cik: number, since: string, get: Get = getText, form4Since = since): Promise<CollectedDocument[]> {
  if (!Number.isSafeInteger(cik) || cik <= 0) throw new Error(`Invalid CIK for ${symbol}`);
  const submissions = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)) as { filings: { recent: Recent } };
  const docs: CollectedDocument[] = [];
  for (const row of filingRows(submissions.filings.recent, since, form4Since)) {
    const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${row.accession.replace(/-/g, "")}/`;
    const file = row.form === "4" ? form4RawPath(row.primary) : row.primary;
    const url = filingUrl(base, file);
    const raw = await get(url);
    const meta: Record<string, unknown> = { accession: row.accession, items: row.items };
    if (row.form === "4") { meta.trades = parseForm4(raw); meta.ownerCik = form4OwnerCik(raw); meta.transactions = parseForm4Transactions(raw); }
    docs.push(sourceDocument({ source: "edgar", symbol, docType: row.form,
      url, publishedAt: `${row.date}T00:00:00Z`, body: raw, meta }, LICENSES.sec));
    if (row.form === "8-K" || row.form === "8-K/A") {
      const index = JSON.parse(await get(`${base}index.json`)) as { directory?: { item?: { name: string; type?: string }[] } };
      const items = index.directory?.item ?? [];
      const exhibit = items.find((item) => /EX-99\.1/i.test(item.type ?? "") || /(?:ex|exhibit)[-_]?99[.-]?1/i.test(item.name));
      if (exhibit && exhibit.name !== row.primary) {
        const exhibitUrl = filingUrl(base, exhibit.name);
        docs.push(sourceDocument({ source: "edgar", symbol, docType: "8-K EX-99.1", url: exhibitUrl,
          publishedAt: `${row.date}T00:00:00Z`, body: await get(exhibitUrl), meta }, LICENSES.sec));
      } else if (!exhibit) {
        // Many filers (NVDA: q2fy27pr.htm, q2fy27cfocommentary.htm) name the exhibit freely and index.json gives no form type.
        for (const name of earningsExhibitNames(items.map((item) => item.name), row.primary, row.items)) {
          const exhibitUrl = filingUrl(base, name);
          docs.push(sourceDocument({ source: "edgar", symbol, docType: /pr|press|release/i.test(name) ? "8-K EX-99.1" : "8-K EX-99.2", url: exhibitUrl,
            publishedAt: `${row.date}T00:00:00Z`, body: await get(exhibitUrl), meta }, LICENSES.sec));
        }
      }
    }
  }
  return docs;
}

export const FOREIGN_FILER_FACT = "sec_filer_status";
export interface FilerStatus { kind: "foreign_private_issuer"; forms: string[]; unknown: { field: string; reason: string }[] }

/**
 * A foreign private issuer files 20-F and 6-K instead of 10-K, 10-Q and 8-K. Decided from the collected filings only, never from a symbol list.
 * Returns null for a domestic filer or when no 20-F or 6-K was collected. Unknown fields carry the reason the bundle shows.
 */
export function foreignFilerStatus(docs: Pick<CollectedDocument, "docType" | "publishedAt">[]): { asOf: string; value: FilerStatus } | null {
  const types = new Set(docs.map((doc) => doc.docType));
  const foreign = docs.filter((doc) => doc.docType === "20-F" || doc.docType === "6-K");
  if (!foreign.length || ["10-K", "10-Q", "8-K"].some((form) => types.has(form))) return null;
  const unknown = [
    { field: "revenueAccelerating", reason: "SEC quarterly revenue needs 10-Q filings; this issuer files 20-F and 6-K." },
    { field: "revenueDeclining", reason: "SEC quarterly revenue needs 10-Q filings; this issuer files 20-F and 6-K." },
    { field: "earnings_8k", reason: "No 8-K earnings exhibit; this issuer files 6-K." },
    ...(types.has("4") ? [] : [{ field: "insider_net_buy_90d", reason: "No Form 4 collected; this issuer does not file Form 4." }]),
  ];
  return { asOf: foreign.map((doc) => doc.publishedAt.slice(0, 10)).sort().pop()!, value: { kind: "foreign_private_issuer", forms: [...new Set(foreign.map((doc) => doc.docType))].sort(), unknown } };
}
