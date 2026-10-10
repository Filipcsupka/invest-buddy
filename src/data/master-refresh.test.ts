import pg from "pg";
import { describe, expect, it } from "vitest";
import universe from "../../scanner/universe.json";
import { parseSubmissions, refreshMaster } from "./master-refresh";
import { loadStoredCiks, loadVendorSymbols } from "./security-master";

describe("parseSubmissions", () => {
  it("reads SIC, fiscal year end, state and exchange, and drops malformed values", () => {
    expect(parseSubmissions({ sic: "7372", sicDescription: "Services-Prepackaged Software", fiscalYearEnd: "0131", stateOfIncorporation: "DE", exchanges: ["Nasdaq"] }))
      .toEqual({ sic: "7372", sicDescription: "Services-Prepackaged Software", fiscalYearEnd: "0131", stateOfIncorporation: "DE", exchange: "Nasdaq" });
    expect(parseSubmissions({ sic: "", fiscalYearEnd: "Jan", exchanges: [] })).toEqual({ sic: null, sicDescription: null, fiscalYearEnd: null, stateOfIncorporation: null, exchange: null });
    expect(parseSubmissions(null).sic).toBeNull();
  });
});

const TODAY = "2026-10-12";
/** One connection, so BEGIN and ROLLBACK wrap everything. Needs a migrated TEST_DATABASE_URL. */
async function inRollback(fn: (pool: pg.Pool) => Promise<void>) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try { await pool.query("BEGIN"); await fn(pool); } finally { await pool.query("ROLLBACK"); await pool.end(); }
}

/** SEC fixture: universe name i gets CIK 9100000+i. SQ is listed as XYZ (or as `sqListedAs`). */
function secFixture(options: { sqListedAs?: string; sic?: string } = {}) {
  const symbols = universe.instruments.map((item) => item.symbol);
  const cikOf = (symbol: string) => 9_100_000 + symbols.indexOf(symbol);
  const list = Object.fromEntries(symbols.map((symbol, i) => [String(i), { ticker: symbol === "SQ" ? options.sqListedAs ?? "XYZ" : symbol, cik_str: cikOf(symbol) }]));
  const get = async (url: string) => {
    if (url.endsWith("company_tickers.json")) return JSON.stringify(list);
    const cik = Number(/CIK(\d{10})\.json$/.exec(url)?.[1]);
    if (!symbols.some((symbol) => cikOf(symbol) === cik)) throw new Error(`no fixture for ${url}`);
    return JSON.stringify({ sic: options.sic ?? "7372", sicDescription: "Services-Prepackaged Software", fiscalYearEnd: "1231", stateOfIncorporation: "DE", exchanges: ["Nasdaq"] });
  };
  return { get, cikOf };
}

describe("security master refresh (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("seeds 37 current rows with SQ mapped to XYZ, fills every CIK, flags SPY as etf, and a second run changes nothing", () => inRollback(async (pool) => {
    const seeded = await pool.query("SELECT ticker, instrument_type, cik FROM instrument_ids WHERE valid_to IS NULL");
    const core = await pool.query("SELECT count(*)::int AS n FROM instruments WHERE source IN ('guide','sample extension','benchmark')");
    expect(seeded.rowCount).toBe(core.rows[0].n);
    expect(seeded.rows.find((r) => r.ticker === "SPY")?.instrument_type).toBe("etf");
    expect((await loadVendorSymbols(pool, "twelvedata")).SQ).toBe("XYZ");
    expect((await loadVendorSymbols(pool, "sec")).SQ).toBe("XYZ");

    const fx = secFixture();
    const first = await refreshMaster(pool, { get: fx.get, today: TODAY });
    expect(first.failures).toEqual([]);
    expect(first.checked).toBe(core.rows[0].n - 1);
    const after = await pool.query("SELECT ticker, instrument_type, cik, sic, fiscal_year_end FROM instrument_ids WHERE valid_to IS NULL ORDER BY ticker");
    expect(after.rowCount).toBe(seeded.rowCount);
    for (const row of after.rows) {
      if (row.instrument_type === "etf") expect(row.cik).toBeNull();
      else { expect(row.cik, row.ticker).not.toBeNull(); expect(row.sic).toBe("7372"); }
    }
    expect((await loadStoredCiks(pool)).get("SQ")).toBe(fx.cikOf("SQ"));
    expect((await pool.query("SELECT count(*)::int AS n FROM instrument_ids WHERE ticker='SQ'")).rows[0].n).toBe(1);

    const second = await refreshMaster(pool, { get: fx.get, today: TODAY });
    expect(second.changes).toEqual([]);
    expect(second.failures).toEqual([]);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("keeps history when a ticker or a SIC changes at SEC", () => inRollback(async (pool) => {
    await refreshMaster(pool, { get: secFixture().get, today: TODAY });
    const renamed = await refreshMaster(pool, { get: secFixture({ sqListedAs: "BLK2", sic: "7373" }).get, today: "2026-10-19" });
    expect(renamed.failures).toEqual([]);
    expect(renamed.changes).toContainEqual({ ticker: "SQ", kind: "sec_symbol", field: "vendor_symbols.sec", from: "XYZ", to: "BLK2" });
    expect(renamed.changes.filter((c) => c.kind === "changed" && c.field === "sic")).toHaveLength(36);
    expect((await loadVendorSymbols(pool, "sec")).SQ).toBe("BLK2");
    expect((await loadVendorSymbols(pool, "twelvedata")).SQ).toBe("XYZ");
    const history = await pool.query("SELECT sic, valid_from::text AS valid_from, valid_to::text AS valid_to FROM instrument_ids WHERE ticker='SQ' ORDER BY id");
    expect(history.rows).toEqual([{ sic: "7372", valid_from: "2026-10-09", valid_to: "2026-10-19" }, { sic: "7373", valid_from: "2026-10-19", valid_to: null }]);
    const again = await refreshMaster(pool, { get: secFixture({ sqListedAs: "BLK2", sic: "7373" }).get, today: "2026-10-19" });
    expect(again.changes).toEqual([]);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("allows one current row per ticker", () => inRollback(async (pool) => {
    await expect(pool.query("INSERT INTO instrument_ids (ticker, valid_from) VALUES ('NVDA', '2026-10-10')")).rejects.toThrow(/instrument_ids_current_idx/);
  }));
});
