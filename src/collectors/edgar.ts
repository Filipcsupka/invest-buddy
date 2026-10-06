import { XMLParser } from "fast-xml-parser";
import { type CollectedDocument } from "./types";
import { LICENSES, sourceDocument } from "./sources/common";
import { getText } from "./http";

type Get = (url: string) => Promise<string>;
type Recent = { form: string[]; accessionNumber: string[]; primaryDocument: string[]; filingDate: string[]; items?: string[] };
/** `dollars` is null when the filing gives no usable price (empty or footnoted price field). It is never counted as 0. */
export interface InsiderTrade { date: string; code: "P" | "S"; shares: number; dollars: number | null }
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

export function filingRows(recent: Recent, since: string, form4Since = since) {
  return recent.form.map((form, i) => ({ form, accession: recent.accessionNumber[i], primary: recent.primaryDocument[i], date: recent.filingDate[i], items: recent.items?.[i] ?? "" }))
    .filter((row) => ["8-K", "10-Q", "10-K", "4", "6-K", "20-F"].includes(row.form) && row.date >= (row.form === "4" ? (form4Since < since ? form4Since : since) : since) && ACCESSION.test(row.accession ?? "") && row.primary);
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
    if (row.form === "4") meta.trades = parseForm4(raw);
    docs.push(sourceDocument({ source: "edgar", symbol, docType: row.form,
      url, publishedAt: `${row.date}T00:00:00Z`, body: raw, meta }, LICENSES.sec));
    if (row.form === "8-K") {
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
