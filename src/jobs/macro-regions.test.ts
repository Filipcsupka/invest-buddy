import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import golden from "./fixtures/macro-us-golden.json";
import { DEFAULT_MACRO_CONFIG, REGIONAL_MACRO_RULES_VERSION } from "../data/macro-rules";
import { loadRegions, REGION_BENCHMARKS } from "../universe/region";
import { migrate } from "../../scripts/migrate";
import { evaluateMacro, runMacro, VIX_DOC_URL, writeMacro, type MacroInputs } from "./macro";
import { withBenchmarks } from "./eodhd-prices";

// The scenarios below must stay identical to the ones that produced fixtures/macro-us-golden.json from origin/main.
const ASOF = golden.asOf;
const day = (o: number) => new Date(Date.parse(`${ASOF}T00:00:00Z`) - o * 86_400_000).toISOString().slice(0, 10);
const bars = (n: number, first: number, end: number, lag = 0) => Array.from({ length: n }, (_, i) => ({ date: day(n - 1 - i + lag), close: Math.round((first + ((end - first) * i) / (n - 1)) * 10000) / 10000 }));
const tickers = ["NVDA", "AMD", "MSFT", "CRWD", "ASML", "SHOP"];
const monthly = (slope: number) => Array.from({ length: 24 }, (_, i) => ({ date: new Date(Date.UTC(2024, 10 + i, 1)).toISOString().slice(0, 10), value: 100 + i * slope + (i > 18 ? i * 0.3 : 0) }));
const base = (): MacroInputs => ({ yields: bars(30, 4.4, 4.2).map((b) => ({ date: b.date, value: b.close })), yieldUrl: "https://fred.stlouisfed.org/series/DGS10",
  cpi: null, cpiUrl: null, ppi: null, ppiUrl: null, vix: [{ date: ASOF, close: 18 }], vixUrl: VIX_DOC_URL,
  universe: Object.fromEntries(tickers.map((t, i) => [t, bars(30, 100, 104 + i)])), spy: bars(30, 100, 102) });
const scenarios: Record<string, MacroInputs> = {
  base: base(),
  noRotation: { ...base(), universe: Object.fromEntries(tickers.map((t) => [t, bars(30, 100, 101)])) },
  risingYields: { ...base(), yields: bars(30, 4.0, 4.5).map((b) => ({ date: b.date, value: b.close })) },
  highVix: { ...base(), vix: [{ date: ASOF, close: 31 }] },
  inflation: { ...base(), cpi: monthly(1), ppi: monthly(0.5), cpiUrl: "https://fred.stlouisfed.org/series/CPIAUCSL", ppiUrl: "https://fred.stlouisfed.org/series/PPIACO" },
  staleSpy: { ...base(), spy: bars(30, 100, 102, 9) },
  lowCoverage: { ...base(), universe: Object.fromEntries(tickers.map((t, i) => [t, i < 3 ? bars(30, 100, 110) : []])) },
  missing: { ...base(), yields: null, yieldUrl: null, vix: null, vixUrl: null, spy: null },
};
const expected = golden.scenarios as Record<string, unknown>;
const europe = (end: number, benchEnd: number) => ({ universe: { "SAP.XETRA": bars(60, 100, end), "ASML.AS": bars(60, 100, end) }, benchmark: bars(60, 100, benchEnd) });

describe("US macro golden", () => {
  it("covers every recorded scenario", () => expect(Object.keys(scenarios).sort()).toEqual(Object.keys(expected).sort()));
  for (const name of Object.keys(expected)) {
    it(`${name}: US outcome equals origin/main`, () => expect(evaluateMacro(scenarios[name], ASOF, DEFAULT_MACRO_CONFIG)).toEqual(expected[name]));
    it(`${name}: European inputs leave the US outcome unchanged`, () => {
      const outcome = evaluateMacro({ ...scenarios[name], europe: europe(110, 101) }, ASOF, DEFAULT_MACRO_CONFIG);
      const { regions, ...us } = outcome;
      expect(us).toEqual(expected[name]);
      expect(regions?.Europe).toBeDefined();
    });
  }
});

describe("European macro outcome", () => {
  it("uses the regional benchmark for rotation and trend, with its own rule version and no documents", () => {
    const outcome = evaluateMacro({ ...base(), europe: europe(120, 102) }, ASOF, DEFAULT_MACRO_CONFIG);
    const eu = outcome.regions!.Europe!;
    expect(eu.sectorRotationIntoGrowth.value).toBe(true);
    expect(eu.sectorRotationIntoGrowth.reason).toContain(`minus ${REGION_BENCHMARKS.Europe}`);
    expect(eu.sectorRotationIntoGrowth.reason).toContain(REGIONAL_MACRO_RULES_VERSION);
    expect(eu.dataTailwind.value).toBe(true);
    expect(eu.dataTailwind.reason).toMatch(/EXSA\.XETRA close .* above its 50-session average/);
  });
  it("is false when the regional names lag and the benchmark falls", () => {
    const eu = evaluateMacro({ ...base(), europe: europe(110, 90) }, ASOF, DEFAULT_MACRO_CONFIG).regions!.Europe!;
    expect(eu.dataTailwind.value).toBe(false);
    expect(eu.sectorRotationIntoGrowth.value).toBe(true); // +3.2% against -3.6% beats the margin
    const lag = evaluateMacro({ ...base(), europe: europe(100, 104) }, ASOF, DEFAULT_MACRO_CONFIG).regions!.Europe!;
    expect(lag.sectorRotationIntoGrowth.value).toBe(false);
  });
  it("is unknown without benchmark bars or with too few of them, never borrowing US data", () => {
    const none = evaluateMacro({ ...base(), europe: { universe: europe(110, 101).universe, benchmark: null } }, ASOF, DEFAULT_MACRO_CONFIG).regions!.Europe!;
    expect([none.dataTailwind.value, none.sectorRotationIntoGrowth.value]).toEqual([null, null]);
    expect(none.sectorRotationIntoGrowth.reason).toBe("Unknown: EXSA.XETRA bars are missing or too short");
    const short = evaluateMacro({ ...base(), europe: { universe: europe(110, 101).universe, benchmark: bars(30, 100, 101) } }, ASOF, DEFAULT_MACRO_CONFIG).regions!.Europe!;
    expect(short.dataTailwind).toMatchObject({ value: null, reason: "Unknown: EXSA.XETRA has 30 bars, 50 needed" });
    expect(evaluateMacro(base(), ASOF, DEFAULT_MACRO_CONFIG).regions).toBeUndefined();
  });
});

describe("price benchmarks", () => {
  it("adds the European benchmark only when a European listing is tracked", () => {
    expect(withBenchmarks(["NVDA", "BRK.B"])).toEqual(["NVDA", "BRK.B", "SPY"]);
    expect(withBenchmarks(["NVDA", "SAP.XETRA"])).toEqual(["NVDA", "SAP.XETRA", "SPY", "EXSA.XETRA"]);
  });
  it("uses the shared region resolver, so a bare-key European member pulls the European benchmark", () => {
    expect(withBenchmarks(["NVDA", "ASML"], new Map([["NVDA", "US"], ["ASML", "Europe"]]))).toEqual(["NVDA", "ASML", "SPY", "EXSA.XETRA"]);
    expect(withBenchmarks(["NVDA"], new Map([["NVDA", "US"]]))).toEqual(["NVDA", "SPY"]);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("regional macro job on postgres", () => {
  const pool = new pg.Pool({ connectionString: url });
  const us = ["NVDA", "AMD"], eu = "P7EU.XETRA", all = [...us, eu];
  const cleanup = async () => {
    await pool.query("DELETE FROM consensus_findings WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM macro_findings WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM scan_runs WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM daily_bars WHERE bar_date > $1::date - 90 AND bar_date <= $1::date AND ticker = ANY($2::text[])", [ASOF, [...all, "SPY", REGION_BENCHMARKS.Europe]]);
  };
  const seed = async (ticker: string, series: { date: string; close: number }[]) => pool.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume)
    SELECT $1,d,c,c,c,c,1000 FROM unnest($2::date[],$3::numeric[]) AS t(d,c) ON CONFLICT (ticker,bar_date) DO NOTHING`, [ticker, series.map((b) => b.date), series.map((b) => b.close)]);
  const rows = async (symbols: string[]) => (await pool.query<{ symbol: string; field: string; value: boolean | null; reason: string; evidence_refs: unknown[] }>(
    "SELECT symbol,field,value,reason,evidence_refs FROM consensus_findings WHERE as_of=$1 AND symbol = ANY($2::text[]) ORDER BY symbol,field", [ASOF, symbols])).rows;

  beforeAll(async () => {
    await migrate(url!);
    await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ($1,'P7 test SE','Unclassified',NULL,'discovery') ON CONFLICT (ticker) DO NOTHING", [eu]);
    await pool.query(`INSERT INTO universe_membership (ticker,list,tier,valid_from,reason,criteria_version,added_by,exchange)
      SELECT $1,'discovery',NULL,DATE '2026-01-01','p7 test','test','test','XETRA' WHERE NOT EXISTS (SELECT 1 FROM universe_membership WHERE ticker=$1)`, [eu]);
  });
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool.query("DELETE FROM universe_membership WHERE ticker=$1", [eu]);
    await pool.query("DELETE FROM instruments WHERE ticker=$1", [eu]);
    await pool.end();
  });

  it("seeds the European benchmark as a never-scored XETRA benchmark", async () => {
    const row = await pool.query("SELECT i.source,m.list,m.exchange,ids.vendor_symbols->>'eodhd' eodhd FROM instruments i JOIN universe_membership m ON m.ticker=i.ticker AND m.valid_to IS NULL JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL WHERE i.ticker=$1", [REGION_BENCHMARKS.Europe]);
    expect(row.rows).toEqual([{ source: "benchmark", list: "benchmark", exchange: "XETRA", eodhd: "EXSA.XETRA" }]);
  });

  it("gives US names the same rows as a US-only run and European names the regional outcome", async () => {
    for (const t of us) await seed(t, bars(30, 100, 108));
    await seed("SPY", bars(30, 100, 102));
    await seed(eu, bars(60, 100, 100.5));
    await seed(REGION_BENCHMARKS.Europe, bars(60, 100, 104));
    await runMacro(pool, ASOF, { fetch: false, tickers: us });
    const usOnly = await rows(us);
    await cleanup();
    for (const t of us) await seed(t, bars(30, 100, 108));
    await seed("SPY", bars(30, 100, 102));
    await seed(eu, bars(60, 100, 100.5));
    await seed(REGION_BENCHMARKS.Europe, bars(60, 100, 104));
    const result = await runMacro(pool, ASOF, { fetch: false, tickers: all });
    expect(await rows(us)).toEqual(usOnly);
    expect(usOnly.find((r) => r.field === "sectorRotationIntoGrowth")?.value).toBe(true);
    const euRows = await rows([eu]);
    expect(euRows.map((r) => [r.field, r.value])).toEqual([["dataTailwind", true], ["sectorRotationIntoGrowth", false]]);
    expect(euRows.every((r) => r.evidence_refs.length === 0 && r.reason.includes(REGIONAL_MACRO_RULES_VERSION))).toBe(true);
    expect(result.regions.Europe?.sectorRotationIntoGrowth.value).toBe(false);
    const macro = await pool.query<{ data: { sectorRotationIntoGrowth: boolean; regions: { Europe: { benchmark: string; sectorRotationIntoGrowth: boolean } } } }>("SELECT data FROM macro_findings WHERE as_of=$1", [ASOF]);
    expect(macro.rows[0].data.sectorRotationIntoGrowth).toBe(true);
    expect(macro.rows[0].data.regions.Europe).toMatchObject({ benchmark: "EXSA.XETRA", sectorRotationIntoGrowth: false });
  });

  it("resolves regions with the key suffix over a default 'US' membership", async () => {
    const stale = "P7EUUS.XETRA", bare = "P7BAREAS";
    try {
      await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ($1,'P7 stale','Unclassified',NULL,'discovery'),($2,'P7 bare','Unclassified',NULL,'discovery') ON CONFLICT (ticker) DO NOTHING", [stale, bare]);
      await pool.query(`INSERT INTO universe_membership (ticker,list,tier,valid_from,reason,criteria_version,added_by,exchange)
        VALUES ($1,'discovery',NULL,DATE '2026-01-01','p7 test','test','test','US'),($2,'discovery',NULL,DATE '2026-01-01','p7 test','test','test','AS')`, [stale, bare]);
      const regions = await loadRegions(pool, ASOF, [stale, bare, eu, "NVDA"]);
      expect(Object.fromEntries(regions)).toEqual({ [stale]: "Europe", [bare]: "Europe", [eu]: "Europe", NVDA: "US" });
    } finally {
      await pool.query("DELETE FROM universe_membership WHERE ticker = ANY($1::text[])", [[stale, bare]]);
      await pool.query("DELETE FROM instruments WHERE ticker = ANY($1::text[])", [[stale, bare]]);
    }
  });

  it("refuses to write a European row without a regional outcome", async () => {
    const outcome = evaluateMacro(base(), ASOF, DEFAULT_MACRO_CONFIG);
    await expect(writeMacro(pool, ASOF, outcome, DEFAULT_MACRO_CONFIG, [eu], new Map([[eu, "Europe" as const]]))).rejects.toThrow(/No Europe macro outcome/);
  });
});
