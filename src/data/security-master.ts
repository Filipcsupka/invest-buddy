import type pg from "pg";
import { DEFAULT_SYMBOL_MAP } from "./twelvedata";

/** Vendors that key on a ticker. Names match the keys of `instrument_ids.vendor_symbols`. */
export type Vendor = "twelvedata" | "sec" | "eodhd";

type Db = Pick<pg.Pool, "query">;
const UNDEFINED_TABLE = "42P01";

/** Reads only the missing-table case (migration 026 not applied yet); every other error is thrown. */
async function queryOrNull<T extends pg.QueryResultRow>(db: Db, sql: string): Promise<T[] | null> {
  try { return (await db.query<T>(sql)).rows; }
  catch (error) { if ((error as { code?: string }).code === UNDEFINED_TABLE) return null; throw error; }
}

/** Our ticker to the vendor's symbol. Rows from `instrument_ids` win; the constant fills in where a row has none or the table is missing. */
export async function loadVendorSymbols(db: Db, vendor: Vendor): Promise<Record<string, string>> {
  const rows = await queryOrNull<{ ticker: string; vendor_symbols: Record<string, unknown> }>(db, "SELECT ticker, vendor_symbols FROM instrument_ids WHERE valid_to IS NULL");
  const out: Record<string, string> = vendor === "eodhd" ? {} : { ...DEFAULT_SYMBOL_MAP };
  for (const row of rows ?? []) {
    const symbol = row.vendor_symbols?.[vendor];
    if (typeof symbol === "string" && symbol) out[row.ticker] = symbol;
  }
  return out;
}

/** Our ticker to the stored CIK. Empty when the table is missing or no CIK is stored yet. */
export async function loadStoredCiks(db: Db): Promise<Map<string, number>> {
  const rows = await queryOrNull<{ ticker: string; cik: string | null }>(db, "SELECT ticker, cik FROM instrument_ids WHERE valid_to IS NULL AND cik IS NOT NULL");
  return new Map((rows ?? []).map((row) => [row.ticker, Number(row.cik)]));
}

/** CIK for a universe symbol: the stored one first, then the SEC ticker list under our ticker or the SEC symbol. */
export function resolveCik(symbol: string, stored: ReadonlyMap<string, number>, secTickers: ReadonlyMap<string, number> | undefined, secSymbols: Readonly<Record<string, string>> = DEFAULT_SYMBOL_MAP): number | undefined {
  return stored.get(symbol) ?? secTickers?.get(symbol) ?? secTickers?.get(secSymbols[symbol] ?? symbol);
}
