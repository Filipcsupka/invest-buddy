export const XETRA_CSV = "https://www.cashmarket.deutsche-boerse.com/resource/blob/1528/856720963dadeaf95e4979e9b8c0e21b/data/t7-xetr-allTradableInstruments.csv";
export const XETRA_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
export const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
export const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

export interface CatalogListing {
  listingKey: string; isin: string | null; wkn: string | null; mnemonic: string | null; name: string;
  exchange: string; listingRegion: "EU" | "US";
  instrumentType: "ETF" | "ACTIVE_ETF" | "ETC" | "ETN";
  tradingCurrency: string | null; ucits: boolean | null;
}

export function parseDelimited(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (ch === ";" && !quoted) { row.push(field); field = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("Xetra CSV has an unterminated quoted field");
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseXetraCsv(text: string): CatalogListing[] {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ""));
  const headerAt = rows.findIndex((row) => row.includes("ISIN") && (row.includes("Instrument Type") || row.includes("Type")));
  if (headerAt < 0) throw new Error("Xetra CSV header missing ISIN or instrument type");
  const header = rows[headerAt]; const at = (name: string) => header.indexOf(name);
  const nameAt = at("Title") >= 0 ? at("Title") : at("Instrument");
  const typeAt = at("Type") >= 0 ? at("Type") : at("Instrument Type");
  const currencyAt = at("Currency") >= 0 ? at("Currency") : at("Settlement Currency");
  if (nameAt < 0 || currencyAt < 0) throw new Error("Xetra CSV header missing name or currency");
  const types: Record<string, CatalogListing["instrumentType"]> = { ETF: "ETF", ETFs: "ETF", "Active ETF": "ACTIVE_ETF", "Active ETFs": "ACTIVE_ETF", ETC: "ETC", ETCs: "ETC", ETN: "ETN", ETNs: "ETN" };
  const listings = new Map<string, CatalogListing>();
  for (const row of rows.slice(headerAt + 1)) {
    const instrumentType = types[row[typeAt]?.trim()]; const isin = row[at("ISIN")]?.trim().toUpperCase();
    const name = row[nameAt]?.trim(); if (!instrumentType || !name || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin ?? "")) continue;
    const currency = row[currencyAt]?.trim().toUpperCase() || null;
    const listing: CatalogListing = { listingKey: isin, isin, exchange: "XETR", listingRegion: "EU", wkn: row[at("WKN")]?.trim() || null, mnemonic: row[at("Mnemonic")]?.trim() || null, name,
      instrumentType, tradingCurrency: currency, // Name and IE/LU domicile are only UCITS hints, never proof of a KID.
      ucits: /\bUCITS\b/i.test(name) || /^(IE|LU)/.test(isin) ? true : null };
    const previous = listings.get(isin);
    if (!previous || (currency === "EUR" && previous.tradingCurrency !== "EUR")) listings.set(isin, listing);
  }
  if (!listings.size) throw new Error("Xetra CSV contains no ETF, ETC, or ETN rows");
  return [...listings.values()];
}

export function discoverXetraCsv(html: string): string {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+\.csv(?:\?[^"']*)?)["']/gi)].map((match) => match[1].replace(/&amp;/g, "&"));
  const href = hrefs.find((value) => /xetr.*allTradableInstruments|allTradableInstruments.*xetr/i.test(value));
  if (!href) throw new Error(`Xetra CSV link not found on ${XETRA_PAGE}`);
  const url = new URL(href, XETRA_PAGE); if (url.protocol !== "https:" || url.hostname !== new URL(XETRA_PAGE).hostname) throw new Error("Xetra CSV link points outside the exchange site");
  return url.href;
}

export async function fetchXetraListings(get: typeof fetch = fetch): Promise<CatalogListing[]> {
  const load = async (url: string) => { const response = await get(url, { signal: AbortSignal.timeout(60_000) }); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.text(); };
  try { return parseXetraCsv(await load(XETRA_CSV)); }
  catch (primary) {
    try { return parseXetraCsv(await load(discoverXetraCsv(await load(XETRA_PAGE)))); }
    catch (fallback) { throw new Error(`Xetra CSV unavailable: primary ${String(primary)}; discovery ${String(fallback)}`); }
  }
}

export function parseNasdaqDirectory(text: string, source: "nasdaqlisted" | "otherlisted"): CatalogListing[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split("|") ?? [];
  const symbolAt = header.indexOf(source === "nasdaqlisted" ? "Symbol" : "ACT Symbol");
  const nameAt = header.indexOf("Security Name"), etfAt = header.indexOf("ETF"), testAt = header.indexOf("Test Issue"), exchangeAt = header.indexOf("Exchange");
  if ([symbolAt,nameAt,etfAt,testAt].includes(-1) || (source === "otherlisted" && exchangeAt < 0)) throw new Error(`${source} has an unexpected header`);
  const exchangeCodes: Record<string,string> = { N: "NYSE", P: "NYSEARCA", A: "AMEX", Z: "BATS", V: "IEX" };
  const result: CatalogListing[] = [];
  for (const line of lines) {
    if (line.startsWith("File Creation Time:")) continue;
    const row = line.split("|"); if (row[etfAt] !== "Y" || row[testAt] !== "N") continue;
    const mnemonic = row[symbolAt]?.trim().toUpperCase(), name = row[nameAt]?.trim();
    if (!mnemonic || !name) continue;
    const exchange = source === "nasdaqlisted" ? "NASDAQ" : exchangeCodes[row[exchangeAt]] ?? row[exchangeAt];
    if (!exchange) continue;
    result.push({ listingKey: `${exchange}:${mnemonic}`, isin: null, wkn: null, mnemonic, name, exchange, listingRegion: "US", instrumentType: "ETF", tradingCurrency: "USD", ucits: null });
  }
  if (!result.length) throw new Error(`${source} contains no ETF rows`);
  return result;
}

export async function fetchCatalogListings(get: typeof fetch = fetch): Promise<CatalogListing[]> {
  const load = async (url: string) => { const response = await get(url, { signal: AbortSignal.timeout(60_000) }); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.text(); };
  const [xetra, nasdaq, other] = await Promise.all([fetchXetraListings(get),load(NASDAQ_LISTED),load(OTHER_LISTED)]);
  return [...xetra,...parseNasdaqDirectory(nasdaq,"nasdaqlisted"),...parseNasdaqDirectory(other,"otherlisted")];
}
