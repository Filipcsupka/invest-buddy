import { expect, it } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { BARS_SQL, FILINGS_SQL, drawdownHit, gateSymbols, insiderCluster, parseArgs, persistGate, relevantFiling, valuationHit } from "./detect";

it("gates 8-K items, 10-Q, 10-K and amendments, ignoring other forms", () => {
  for (const form of ["10-Q", "10-K", "10-Q/A", "10-K/A"]) expect(relevantFiling({ form, items: "" })).toBe(true);
  for (const item of ["2.02", "4.02", "5.02"]) expect(relevantFiling({ form: "8-K", items: `1.01,${item},9.01` })).toBe(true);
  expect(relevantFiling({ form: "8-K/A", items: "5.02" })).toBe(true);
  expect(relevantFiling({ form: "8-K", items: "1.01,9.01" })).toBe(false);
  expect(relevantFiling({ form: "4", items: "" })).toBe(false);
});

const buy = (accession: string, ownerCik: string, date = "2026-10-01", isNew = true) => ({ symbol: "NVDA", accession, date, ownerCik, trades: [{ code: "P", date }], isNew });
it("requires three opportunistic Form 4 buys in 30 days, one still new", () => {
  const rows = [buy("a", "1"), buy("b", "2"), buy("c", "3")];
  expect(insiderCluster(rows, "2026-10-06")).toEqual(["NVDA"]);
  expect(insiderCluster(rows.map((r) => ({ ...r, isNew: false })), "2026-10-06")).toEqual([]);
  expect(insiderCluster(rows.slice(0, 2), "2026-10-06")).toEqual([]);
  expect(insiderCluster([buy("old", "1", "2025-10-05"), ...rows], "2026-10-06")).toEqual([]);
});

it("marks only band crossings and an empty day produces no symbols", () => {
  expect(drawdownHit({ symbol: "NVDA", previous: -19, current: -21 })).toBe(true);
  expect(drawdownHit({ symbol: "NVDA", previous: -21, current: -22 })).toBe(false);
  expect(valuationHit({ symbol: "NVDA", previous: 26, current: 24 })).toBe(true);
  expect(valuationHit({ symbol: "NVDA", previous: 24, current: 23 })).toBe(false);
  const empty = { filings: [{ symbol: "NVDA", accession: "a", form: "8-K", items: "1.01" }], insiders: [], drawdowns: [], valuations: [], today: "2026-10-06" };
  expect(gateSymbols(empty, ["NVDA", "AMD"])).toEqual({ symbols: [], reasons: {} });
  expect(gateSymbols({ ...empty, filings: [{ symbol: "AMD", accession: "b", form: "10-Q", items: "" }] }, ["NVDA", "AMD"]).symbols).toEqual(["AMD"]);
});

it("keeps filing, 52-week drawdown and P/E gate results when queries are bounded", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE filing_watch (symbol text, accession text, form text, items text, filed_at date, first_seen_at timestamptz DEFAULT now());
      CREATE TABLE source_documents (symbol text, meta jsonb, doc_type text, body text);
      CREATE TABLE extraction_runs (symbol text, status text, applied_at timestamptz, created_at timestamptz);
      CREATE TABLE daily_bars (ticker text, bar_date date, close numeric, high numeric);
      CREATE TABLE collected_facts (symbol text, fact_key text, as_of date, value jsonb);`);
    await db.exec(`INSERT INTO filing_watch (symbol,accession,form,items,filed_at) VALUES
      ('NVDA','0000000001-26-000001','10-Q','',current_date),
      ('OUT','0000000002-26-000001','10-K','',current_date);
      INSERT INTO daily_bars (ticker,bar_date,close,high)
      SELECT ticker,current_date - (259 - n),
        CASE WHEN ticker='NVDA' AND n=259 THEN 79 WHEN ticker='NVDA' AND n=258 THEN 81
          WHEN ticker='NVDA' THEN 85 WHEN ticker='OUT' THEN 70 ELSE 95 END,
        CASE WHEN ticker='NVDA' AND n=59 THEN 100 WHEN ticker='OUT' THEN 100 ELSE 96 END
      FROM (VALUES ('NVDA'),('AMD'),('OUT')) AS names(ticker), generate_series(0,259) AS days(n);
      INSERT INTO daily_bars VALUES ('NVDA',current_date - 400,80,150);
      INSERT INTO collected_facts VALUES
        ('AMD','valuation_pe',current_date - 1,'{"pe":30}'),('AMD','valuation_pe',current_date,'{"pe":24}'),
        ('OUT','valuation_pe',current_date - 1,'{"pe":30}'),('OUT','valuation_pe',current_date,'{"pe":24}');`);
    const universe = ["NVDA", "AMD"];
    const oldFilings = FILINGS_SQL.replace("w.symbol = ANY($1::text[]) AND ($2::date IS NULL OR w.filed_at >= $2::date)", "($1::date IS NULL OR w.filed_at >= $1::date)");
    const oldBars = BARS_SQL.replace("\n      WHERE ticker = ANY($1::text[]) AND bar_date >= current_date - 380", "");
    const valuationSql = `WITH ranked AS (SELECT symbol,(value->>'pe')::numeric AS pe,
      lag((value->>'pe')::numeric) OVER (PARTITION BY symbol ORDER BY as_of) AS previous,
      row_number() OVER (PARTITION BY symbol ORDER BY as_of DESC) AS rn FROM collected_facts WHERE fact_key='valuation_pe')
      SELECT symbol,pe::text AS current,previous::text FROM ranked WHERE rn=1 AND previous IS NOT NULL`;
    const valuations = (await db.query<{ symbol: string; current: string; previous: string }>(valuationSql)).rows;
    const asGate = (filings: FilingRow[], bars: BarRow[]) => gateSymbols({ today: new Date().toISOString().slice(0, 10), filings,
      insiders: [], drawdowns: bars.map((r) => ({ symbol: r.symbol, current: 100 * (Number(r.close) / Number(r.high) - 1), previous: 100 * (Number(r.previous) / Number(r.high) - 1) })),
      valuations: valuations.map((r) => ({ symbol: r.symbol, current: Number(r.current), previous: Number(r.previous) })) }, universe);
    type FilingRow = { symbol: string; accession: string; form: string; items: string };
    type BarRow = { symbol: string; close: string; high: string; previous: string };
    const before = asGate((await db.query<FilingRow>(oldFilings, [null])).rows, (await db.query<BarRow>(oldBars)).rows);
    const after = asGate((await db.query<FilingRow>(FILINGS_SQL, [universe, null])).rows, (await db.query<BarRow>(BARS_SQL, [universe])).rows);
    expect(after).toEqual(before);
    expect(after).toEqual({ symbols: ["NVDA", "AMD"], reasons: {
      NVDA: ["10-Q 0000000001-26-000001", "drawdown band 20%"], AMD: ["valuation P/E band 25"],
    } });
  } finally { await db.close(); }
});

it("validates detect arguments", () => {
  expect(parseArgs(["--output", "/tmp/gate.json", "--since", "2026-10-01"])).toEqual({ out: "/tmp/gate.json", since: "2026-10-01" });
  expect(() => parseArgs(["--since", "2026-02-30"])).toThrow();
  expect(() => parseArgs(["--bogus"])).toThrow();
});

it.skipIf(!process.env.TEST_DATABASE_URL)("persists the daily gate and reopens it only for new work", async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const date = "2099-07-19";
  try {
    const first = await persistGate(pool, { asOf: date, symbols: ["NVDA"], reasons: { NVDA: ["10-Q"] }, accessions: { NVDA: ["0000000000-99-000001"] } });
    expect(first.symbols).toEqual(["NVDA"]);
    await pool.query("UPDATE scheduled_gates SET extracted_at=now(),judged_at=now() WHERE gate_date=$1", [date]);
    await persistGate(pool, { asOf: date, symbols: ["NVDA"], reasons: { NVDA: ["10-Q"] }, accessions: { NVDA: ["0000000000-99-000001"] } });
    expect((await pool.query("SELECT extracted_at,judged_at FROM scheduled_gates WHERE gate_date=$1", [date])).rows[0]).toMatchObject({ extracted_at: expect.any(Date), judged_at: expect.any(Date) });
    const research = { asOf: date, symbols: ["NVDA"], reasons: { NVDA: ["10-Q", "verified research document 42"] }, accessions: { NVDA: ["0000000000-99-000001"] } };
    const researchGate = await persistGate(pool, research);
    expect(researchGate.revision).toBe((first.revision ?? 0) + 1);
    await pool.query("UPDATE scheduled_gates SET extracted_at=now(),judged_at=now() WHERE gate_date=$1", [date]);
    expect((await persistGate(pool, research)).revision).toBe(researchGate.revision);
    expect((await pool.query("SELECT extracted_at,judged_at FROM scheduled_gates WHERE gate_date=$1", [date])).rows[0]).toMatchObject({ extracted_at: expect.any(Date), judged_at: expect.any(Date) });
    const second = await persistGate(pool, { asOf: date, symbols: ["AMD"], reasons: { AMD: ["approved discovery candidate"] }, accessions: { AMD: [] } });
    expect(second.symbols).toEqual(["AMD", "NVDA"]);
    expect((await pool.query("SELECT extracted_at,judged_at FROM scheduled_gates WHERE gate_date=$1", [date])).rows[0]).toMatchObject({ extracted_at: null, judged_at: null });
  } finally { await pool.query("DELETE FROM scheduled_gates WHERE gate_date=$1", [date]); await pool.end(); }
});

it("includes a promoted discovery name even without a filing", () => {
  const gate = gateSymbols({ today: "2026-10-07", filings: [], insiders: [], drawdowns: [], valuations: [], newSymbols: ["F7ZZ"] }, ["NVDA", "F7ZZ"]);
  expect(gate).toEqual({ symbols: ["F7ZZ"], reasons: { F7ZZ: ["approved discovery candidate awaiting first extraction"] } });
});

it("gates a newly verified research document once its extraction is due", () => {
  const base = { today: "2026-10-11", filings: [], insiders: [], drawdowns: [], valuations: [] };
  expect(gateSymbols({ ...base, researchDocuments: [{ symbol: "NVDA", id: 42 }] }, ["NVDA"]))
    .toEqual({ symbols: ["NVDA"], reasons: { NVDA: ["verified research document 42"] } });
});

it("keeps macro_release findings out of the research document extraction trigger", () => {
  // The query runs inside main(); a verified MACRO page must never queue an extract call.
  const source = readFileSync(new URL("./detect.ts", import.meta.url), "utf8");
  const query = source.match(/const researchDocuments = [\s\S]*?\[since\]\);/)?.[0] ?? "";
  expect(query).toContain("d.doc_type='research_page'");
  expect(query).toContain("f.kind <> 'macro_release'");
});
