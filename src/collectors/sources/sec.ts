import type { SourceHttp } from "./client";
import { marketTicker, parseJson, type Company } from "./common";

export const COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
export interface TickerRow { cik: number; ticker: string; title: string }
export interface TickerMap { byCik: Map<number, TickerRow>; byTicker: Map<string, TickerRow> }

export async function loadTickers(http: SourceHttp): Promise<TickerMap> {
  const rows = parseJson<Record<string, { cik_str: number; ticker: string; title?: string }>>(await http.get(COMPANY_TICKERS_URL), "SEC company_tickers");
  const byCik = new Map<number, TickerRow>(), byTicker = new Map<string, TickerRow>();
  for (const row of Object.values(rows)) {
    const entry = { cik: Number(row.cik_str), ticker: String(row.ticker).toUpperCase(), title: String(row.title ?? "") };
    if (!byCik.has(entry.cik)) byCik.set(entry.cik, entry);
    byTicker.set(entry.ticker, entry);
  }
  return { byCik, byTicker };
}

/** CIK to universe symbol. Universe symbol SQ is looked up as XYZ. */
export function universeByCik(companies: Company[], tickers: TickerMap): Map<number, string> {
  const out = new Map<number, string>();
  for (const company of companies) {
    const row = tickers.byTicker.get(company.symbol) ?? tickers.byTicker.get(marketTicker(company.symbol));
    if (row) out.set(row.cik, company.symbol);
  }
  return out;
}
