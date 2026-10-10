import type pg from "pg";

/** Fields the refresh reads from SEC. The company_tickers list gives the CIK, submissions give the rest. */
export interface Observed {
  cik: number | null;
  sic: string | null;
  sicDescription: string | null;
  fiscalYearEnd: string | null;
  stateOfIncorporation: string | null;
  exchange: string | null;
}

export interface MasterRow {
  id: number;
  ticker: string;
  instrumentType: string;
  cik: number | null;
  sic: string | null;
  sicDescription: string | null;
  fiscalYearEnd: string | null;
  stateOfIncorporation: string | null;
  exchange: string | null;
  vendorSymbols: Record<string, string>;
}

export interface RefreshChange { ticker: string; kind: "filled" | "changed" | "sec_symbol"; field: string; from: string | null; to: string | null }
export interface RefreshResult { checked: number; changes: RefreshChange[]; failures: { ticker: string; reason: string }[] }

type Db = Pick<pg.Pool, "query">;
type SecTickers = Record<string, { ticker: string; cik_str: number }>;

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function parseSubmissions(json: unknown): Omit<Observed, "cik"> {
  const o = (json ?? {}) as Record<string, unknown>;
  const exchanges = Array.isArray(o.exchanges) ? o.exchanges : [];
  const fye = str(o.fiscalYearEnd);
  return {
    sic: str(o.sic), sicDescription: str(o.sicDescription), fiscalYearEnd: fye && /^\d{4}$/.test(fye) ? fye : null,
    stateOfIncorporation: str(o.stateOfIncorporation), exchange: str(exchanges.find((e) => typeof e === "string" && e)),
  };
}

const FIELDS: { field: string; key: keyof Omit<Observed, "cik"> | "cik"; column: string }[] = [
  { field: "cik", key: "cik", column: "cik" }, { field: "sic", key: "sic", column: "sic" },
  { field: "sic_description", key: "sicDescription", column: "sic_description" }, { field: "fiscal_year_end", key: "fiscalYearEnd", column: "fiscal_year_end" },
  { field: "state_of_incorporation", key: "stateOfIncorporation", column: "state_of_incorporation" }, { field: "exchange", key: "exchange", column: "exchange" },
];

async function currentRows(db: Db): Promise<MasterRow[]> {
  const rows = (await db.query<Record<string, unknown>>(`SELECT id, ticker, instrument_type, cik, sic, sic_description, fiscal_year_end, state_of_incorporation, exchange, vendor_symbols
    FROM instrument_ids WHERE valid_to IS NULL ORDER BY ticker`)).rows;
  return rows.map((r) => ({
    id: Number(r.id), ticker: String(r.ticker), instrumentType: String(r.instrument_type), cik: r.cik == null ? null : Number(r.cik),
    sic: r.sic as string | null, sicDescription: r.sic_description as string | null, fiscalYearEnd: r.fiscal_year_end as string | null,
    stateOfIncorporation: r.state_of_incorporation as string | null, exchange: r.exchange as string | null, vendorSymbols: (r.vendor_symbols ?? {}) as Record<string, string>,
  }));
}

/**
 * Refreshes `instrument_ids` from SEC. A null field that now has a value is filled in place. A field that already had a different
 * value closes the current row (valid_to = today) and inserts a new one, so the old value stays as history. A second run on the same
 * input changes nothing. ETFs are skipped. Only the SEC symbol is updated when a ticker disappears from the SEC list and the stored CIK
 * lists a new one; the Twelve Data symbol is never changed from here.
 */
export async function refreshMaster(db: Db, deps: { get: (url: string) => Promise<string>; today: string; dryRun?: boolean; tickers?: string[] }): Promise<RefreshResult> {
  const list = JSON.parse(await deps.get("https://www.sec.gov/files/company_tickers.json")) as SecTickers;
  const byTicker = new Map<string, number>(), byCik = new Map<number, string>();
  for (const row of Object.values(list)) {
    const t = String(row.ticker).toUpperCase();
    byTicker.set(t, Number(row.cik_str));
    if (!byCik.has(Number(row.cik_str))) byCik.set(Number(row.cik_str), t);
  }
  const result: RefreshResult = { checked: 0, changes: [], failures: [] };
  for (const row of await currentRows(db)) {
    if (row.instrumentType !== "equity" || (deps.tickers && !deps.tickers.includes(row.ticker))) continue;
    result.checked++;
    try {
      const secSymbol = row.vendorSymbols.sec ?? row.ticker;
      const listed = byTicker.get(secSymbol) ?? byTicker.get(row.ticker);
      const next: Observed = { cik: row.cik ?? listed ?? null, sic: null, sicDescription: null, fiscalYearEnd: null, stateOfIncorporation: null, exchange: null };
      let vendorSymbols = row.vendorSymbols;
      if (row.cik !== null && listed === undefined) {
        const renamed = byCik.get(row.cik);
        if (renamed) {
          vendorSymbols = { ...row.vendorSymbols, sec: renamed };
          result.changes.push({ ticker: row.ticker, kind: "sec_symbol", field: "vendor_symbols.sec", from: row.vendorSymbols.sec ?? row.ticker, to: renamed });
        }
      }
      if (next.cik === null) { result.failures.push({ ticker: row.ticker, reason: "no CIK in SEC company_tickers" }); continue; }
      Object.assign(next, parseSubmissions(JSON.parse(await deps.get(`https://data.sec.gov/submissions/CIK${String(next.cik).padStart(10, "0")}.json`))));

      const fills: Record<string, string | number> = {}, versioned: Record<string, string | number> = {};
      for (const { field, key, column } of FIELDS) {
        const was = row[key as keyof MasterRow] as string | number | null, now = next[key];
        if (now === null || was === now) continue;
        if (was === null) { fills[column] = now; result.changes.push({ ticker: row.ticker, kind: "filled", field, from: null, to: String(now) }); }
        else { versioned[column] = now; result.changes.push({ ticker: row.ticker, kind: "changed", field, from: String(was), to: String(now) }); }
      }
      const symbolChanged = vendorSymbols !== row.vendorSymbols;
      if (deps.dryRun || (!Object.keys(fills).length && !Object.keys(versioned).length && !symbolChanged)) continue;
      if (Object.keys(versioned).length || symbolChanged) {
        await db.query("UPDATE instrument_ids SET valid_to = $2::date WHERE id = $1 AND valid_to IS NULL", [row.id, deps.today]);
        const values = { cik: row.cik, sic: row.sic, sic_description: row.sicDescription, fiscal_year_end: row.fiscalYearEnd, state_of_incorporation: row.stateOfIncorporation, exchange: row.exchange, ...fills, ...versioned };
        await db.query(`INSERT INTO instrument_ids (ticker, instrument_type, cik, sic, sic_description, fiscal_year_end, state_of_incorporation, exchange, vendor_symbols, valid_from)
          SELECT ticker, instrument_type, $2::bigint, $3::text, $4::text, $5::text, $6::text, $7::text, $8::jsonb, $9::date FROM instrument_ids WHERE id = $1`,
        [row.id, values.cik, values.sic, values.sic_description, values.fiscal_year_end, values.state_of_incorporation, values.exchange, JSON.stringify(vendorSymbols), deps.today]);
      } else {
        const columns = Object.keys(fills);
        await db.query(`UPDATE instrument_ids SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`, [row.id, ...columns.map((c) => fills[c])]);
      }
    } catch (error) { result.failures.push({ ticker: row.ticker, reason: error instanceof Error ? error.message : String(error) }); }
  }
  return result;
}
