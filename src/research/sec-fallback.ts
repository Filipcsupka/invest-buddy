import { companyCiks, eightKExhibits, filingBase, filingUrl, filingRows } from "../collectors/edgar";
import { getText } from "../collectors/http";
import { findQuote, htmlToText } from "./html-text";

/** Company press releases are filed as 8-K exhibits. When the company's own site blocks the verifier, the same text can still be read from SEC. */
export type SecGet = (url: string) => Promise<string>;

export interface SecHit {
  url: string;
  docType: string;
  filedAt: string;
  text: string;
  match: "exact" | "fuzzy";
}

/** At most this many 8-K filings are opened per quote, newest first. Each costs two SEC requests (index and exhibit). */
export const MAX_FILINGS = 6;
/** The release is filed on the day or within days of the date the model cites. */
const BEFORE_DAYS = 5;
const AFTER_DAYS = 10;
const DAY_MS = 86_400_000;

let ciks: Promise<Map<string, number>> | null = null;
export function resetSecFallback() { ciks = null; }

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Looks for `quote` in the 8-K exhibits of `symbol` filed near `anchor` (the claimed date), or in the last `fallbackDays` before `now`.
 * Returns null when the symbol has no CIK, no filing in the window, or no exhibit holds the quote. Throws only when SEC itself fails.
 */
export async function findQuoteInSecExhibits(
  symbol: string, quote: string, opts: { anchor?: string | null; now: Date; fallbackDays: number; get?: SecGet },
): Promise<SecHit | null> {
  const get = opts.get ?? ((url: string) => getText(url));
  ciks ??= companyCiks(get);
  let cik: number | undefined;
  try { cik = (await ciks).get(symbol.toUpperCase()); } catch (error) { ciks = null; throw error; }
  if (!cik) return null;
  const today = opts.now.toISOString().slice(0, 10);
  const from = opts.anchor ? shift(opts.anchor, -BEFORE_DAYS) : shift(today, -opts.fallbackDays);
  const to = opts.anchor ? shift(opts.anchor, AFTER_DAYS) : today;
  const submissions = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)) as {
    filings: { recent: Parameters<typeof filingRows>[0] };
  };
  const filings = filingRows(submissions.filings.recent, from)
    .filter((row) => (row.form === "8-K" || row.form === "8-K/A") && row.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_FILINGS);
  for (const row of filings) {
    const base = filingBase(cik, row.accession);
    const index = JSON.parse(await get(`${base}index.json`)) as { directory?: { item?: { name: string; type?: string }[] } };
    for (const exhibit of eightKExhibits(index.directory?.item ?? [], row.primary, row.items)) {
      const url = filingUrl(base, exhibit.name);
      const text = htmlToText(await get(url));
      const found = findQuote(text, quote);
      if (found) return { url, docType: exhibit.docType, filedAt: row.date, text, match: found.match };
    }
  }
  return null;
}
