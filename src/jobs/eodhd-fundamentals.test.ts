import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEodhdCalendar, parseEodhdFundamentals } from "../data-providers/eodhd/fundamentals";
import type { EarningsCalendar, Fundamentals } from "../data-providers/eodhd/client";
import pg from "pg";
import { revenueFromCompanyFacts } from "../data/sec";
import { dueForRefresh, loadSubjects, parseArgs, runEodhdFundamentals, storeClassification } from "./eodhd-fundamentals";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/data-providers/eodhd/fixtures/offline", name), "utf8"));
const fundamentals = fixture("AAPL.US.json") as Fundamentals;
const calendar = fixture("earnings.json") as EarningsCalendar;
const real = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/data-providers/eodhd/fixtures/real", name), "utf8")).response as Fundamentals;

describe("EODHD subject mapping", () => {
  it("maps exchange-qualified instruments to the same vendor symbol", async () => {
    const sql: string[] = [];
    const db = { query: async (statement: string) => {
      sql.push(statement);
      return statement.includes("FROM universe_membership")
        ? { rows: [{ ticker: "SAP.XETRA", name: "SAP", sector: "Tech", tier: null }] }
        : { rows: [{ ticker: "SAP.XETRA", vendor_symbol: "SAP.XETRA" }] };
    } } as never;
    expect(await loadSubjects(db)).toEqual([{ ticker: "SAP.XETRA", vendorSymbol: "SAP.XETRA" }]);
    expect(sql[1]).toContain("vendor_symbol=i.ticker");
  });
});

describe("EODHD fundamentals parsing", () => {
  it("uses report dates for revenue, EPS and shares; ignores future and undated rows", () => {
    const payload = structuredClone(fundamentals);
    const income = (payload.Financials as { Income_Statement: { quarterly: Record<string, unknown> } }).Income_Statement.quarterly;
    income["2026-12-31"] = { date: "2026-12-31", totalRevenue: 200 };
    income["2025-12-31"] = { date: "2025-12-31", filing_date: "2025-11-01", totalRevenue: 10 };
    const parsed = parseEodhdFundamentals(payload, "AAPL", "2025-10-21");
    expect(parsed.rows.filter((row) => row.concept === "Revenues")).toHaveLength(4);
    expect(parsed.rows.find((row) => row.periodEnd === "2025-09-30" && row.concept === "Revenues")).toMatchObject({ filed: "2025-10-15", periodStart: "2025-07-01", value: 130 });
    expect(parsed.rows.find((row) => row.concept === "EntityCommonStockSharesOutstanding" && row.periodEnd === "2025-09-30")).toMatchObject({ filed: "2025-10-15", value: 15_000_000_000 });
    expect(parsed.earnings.at(-1)).toMatchObject({ reportedDate: "2025-10-15", reportedEps: 2.4, estimatedEps: 2.34, surprisePct: 2.56 });
    expect(parseEodhdFundamentals(fundamentals, "AAPL", "2025-10-14").rows.some((row) => row.periodEnd === "2025-09-30")).toBe(false);
  });
  it("keeps off-calendar fiscal quarters usable for revenue growth", async () => {
    const ends = ["2024-05-31", "2024-08-31", "2025-05-31", "2025-08-31"];
    const revenue = [100, 100, 110, 130];
    const payload: Fundamentals = { General: { CurrencyCode: "USD" }, Financials: { Income_Statement: { quarterly:
      Object.fromEntries(ends.map((end, i) => [end, { date: end, filing_date: new Date(Date.parse(`${end}T00:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10), currency_symbol: "USD", totalRevenue: revenue[i] }])) } } };
    const parsed = parseEodhdFundamentals(payload, "OFF", "2025-10-01");
    const latest = parsed.rows.find((row) => row.periodEnd === "2025-08-31");
    expect(latest?.periodStart).toBe("2025-06-01");
    const { revenueFromCompanyFacts } = await import("../data/sec");
    const facts = parsed.rows.map((row) => ({ start: row.periodStart!, end: row.periodEnd, val: row.value, accn: row.accession,
      fy: row.fy!, fp: row.fp!, form: row.form, filed: row.filed }));
    expect(revenueFromCompanyFacts({ facts: { "us-gaap": { Revenues: { units: { USD: facts } } } } }, "2025-10-01")?.revenueAccelerating).toBe(true);
  });
  it("stores six-month periods for a half-year reporter and keeps a single missing quarter as three months", () => {
    const halves = ["2024-06-30", "2024-12-31", "2025-06-30", "2025-12-31"];
    const filed = ["2024-09-15", "2025-03-15", "2025-09-15", "2026-03-15"];
    const payload: Fundamentals = { General: { CurrencyCode: "GBP" }, Financials: { Income_Statement: { quarterly:
      Object.fromEntries(halves.map((end, i) => [end, { date: end, filing_date: filed[i], currency_symbol: "GBP", totalRevenue: 100 + i }])) } } };
    const parsed = parseEodhdFundamentals(payload, "ZZH.LSE", "2026-10-01").rows.filter((row) => row.concept === "Revenues");
    expect(parsed.map((row) => [row.periodStart, row.periodEnd])).toEqual([
      ["2024-01-01", "2024-06-30"], ["2024-07-01", "2024-12-31"], ["2025-01-01", "2025-06-30"], ["2025-07-01", "2025-12-31"],
    ]);
    const gapped = ["2025-03-31", "2025-06-30", "2025-12-31", "2026-03-31"];
    const quarterly: Fundamentals = { General: { CurrencyCode: "USD" }, Financials: { Income_Statement: { quarterly:
      Object.fromEntries(gapped.map((end) => [end, { date: end, filing_date: "2026-05-01", currency_symbol: "USD", totalRevenue: 100 }])) } } };
    expect(parseEodhdFundamentals(quarterly, "GAP", "2026-10-01").rows.find((row) => row.periodEnd === "2025-12-31")?.periodStart).toBe("2025-10-01");
  });
  it("LSE fixture inventory: ULVR has half-year values but no currency or enough report dates; SHEL has quarters", () => {
    const ulvr = parseEodhdFundamentals(real("half-year-ulvr.json"), "ULVR.LSE", "2026-11-06");
    expect(ulvr.rows.filter((row) => row.concept === "Revenues")).toHaveLength(0);
    const shel = parseEodhdFundamentals(real("half-year-shel.json"), "SHEL.LSE", "2026-11-06");
    expect(shel.rows.filter((row) => row.concept === "Revenues").every((row) =>
      (Date.parse(row.periodEnd) - Date.parse(row.periodStart!)) / 86_400_000 <= 105)).toBe(true);
  });
  it("replays captured ULVR half-year values with synthetic currency and filing dates", () => {
    const captured = real("half-year-ulvr.json");
    const income = (captured.Financials as { Income_Statement: { quarterly: Record<string, Record<string, unknown>> } }).Income_Statement.quarterly;
    const syntheticFiled: Record<string, string> = {
      "2024-06-30": "2024-07-31", "2024-12-31": "2025-03-13", "2025-06-30": "2025-07-31", "2025-12-31": "2026-01-31",
    };
    // The captured revenue values and periods are real; EUR currency and these availability dates are test-only inputs.
    const syntheticHalfYearFixture: Fundamentals = { Financials: { Income_Statement: { quarterly:
      Object.fromEntries(Object.entries(syntheticFiled).map(([end, filed]) => [end,
        { ...income[end], currency_symbol: "EUR", filing_date: filed }])) } } };
    const parse = (asOf: string) => parseEodhdFundamentals(syntheticHalfYearFixture, "ULVR.LSE", asOf).rows
      .filter((row) => row.concept === "Revenues").map((row) => ({ start: row.periodStart!, end: row.periodEnd, filed: row.filed,
        val: row.value, accn: row.accession, fy: row.fy!, fp: row.fp!, form: row.form }));
    const score = (facts: ReturnType<typeof parse>, asOf: string) => revenueFromCompanyFacts({ facts: { "us-gaap":
      { Revenues: { units: { USD: facts } } } } }, asOf);
    const facts = parse("2026-02-01");
    expect(facts).toHaveLength(4);
    expect(facts.every((fact) => (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000 >= 170)).toBe(true);
    expect(score(facts.filter((fact) => (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000 <= 105), "2026-02-01")).toBeNull();
    const after = score(facts, "2026-02-01");
    expect(after).toMatchObject({ period: "half ended 2025-12-31", revenueAccelerating: true, revenueDeclining: true });
    expect(after?.currentGrowth).toBeCloseTo(-15.676);
    expect(after?.priorGrowth).toBeCloseTo(-18.032);
    // Improving growth still earns no acceleration points when revenue is declining.
    expect(Number(after?.revenueAccelerating && !after.revenueDeclining) * 4).toBe(0);
    expect(score(parse("2026-01-30"), "2026-01-30")).toBeNull();
  });
  it("parses a bulk calendar and filters the requested window", () => {
    expect(parseEodhdCalendar(calendar, "2025-10-01", "2025-10-31")).toMatchObject([{ vendorSymbol: "AAPL.US", reportDate: "2025-10-15", fiscalDateEnding: "2025-09-30", estimate: 2.34 }]);
  });
  it("accepts the verified filter value and fixture dry-run arguments", () => {
    expect(parseArgs(["--dry-run", "--fixture-dir", "fixtures", "--only", "AAPL.US", "--filter", "Financials::Income_Statement::quarterly"]).filter).toBe("Financials::Income_Statement::quarterly");
    expect(() => parseArgs(["--fixture-dir", "fixtures", "--only", "AAPL.US"])).toThrow(/dry-run/);
    expect(parseArgs(["--dry-run", "--as-of", "2025-10-21"]).now?.toISOString()).toBe("2025-10-21T12:00:00.000Z");
  });
  it("uses real SAP report dates and dateFormatted share periods", () => {
    const parsed = parseEodhdFundamentals(real("sap-full.json"), "SAP.XETRA", "2026-11-06");
    expect(parsed.rows.find((row) => row.concept === "Revenues" && row.periodEnd === "2026-09-30"))
      .toMatchObject({ filed: "2026-10-20", unit: "EUR", value: 10_270_000_000 });
    expect(parsed.rows.find((row) => row.concept === "EntityCommonStockSharesOutstanding" && row.periodEnd === "2026-09-30"))
      .toMatchObject({ filed: "2026-10-20", value: 1_164_000_000 });
    expect(parseEodhdFundamentals(real("sap-full.json"), "SAP.XETRA", "2026-10-19").rows
      .some((row) => row.periodEnd === "2026-09-30")).toBe(false);
  });
  it("receives a bare date map from the quarterly filter", () => {
    const filtered = real("sap-quarterly-filter.json") as Record<string, { totalRevenue: string }>;
    expect(filtered).not.toHaveProperty("Financials");
    expect(filtered["2026-09-30"].totalRevenue).toBe("10270000000.00");
  });
  it("does not label HSBC's USD revenue as GBX or publish an undated period", () => {
    const parsed = parseEodhdFundamentals(real("hsba-full.json"), "HSBA.LSE", "2026-11-06");
    expect(parsed.rows.find((row) => row.concept === "Revenues" && row.periodEnd === "2026-06-30"))
      .toMatchObject({ filed: "2026-08-04", unit: "USD" });
    expect(parsed.rows.some((row) => row.concept === "Revenues" && row.periodEnd === "2026-09-30")).toBe(false);
  });
  it("waits for a later filing date when it follows the earnings report", () => {
    const payload = structuredClone(real("sap-full.json"));
    const quarters = (payload.Financials as { Income_Statement: { quarterly: Record<string, { filing_date: string }> } }).Income_Statement.quarterly;
    quarters["2026-09-30"].filing_date = "2026-10-25";
    expect(parseEodhdFundamentals(payload, "SAP.XETRA", "2026-10-24").rows.some((row) => row.periodEnd === "2026-09-30" && row.concept === "Revenues")).toBe(false);
    expect(parseEodhdFundamentals(payload, "SAP.XETRA", "2026-10-25").rows.find((row) => row.periodEnd === "2026-09-30" && row.concept === "Revenues")?.filed).toBe("2026-10-25");
  });
});

describe("EODHD refresh scheduling", () => {
  it("matches nearby report dates, backs off missed updates, and refreshes stale calendar-free symbols", () => {
    expect(dueForRefresh(null, undefined, "2025-10-21")).toBe(true);
    expect(dueForRefresh(null, { attemptedAt: "2025-10-15T00:00:00Z", latestReportDate: null }, "2025-10-21")).toBe(false);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-18T00:00:00Z", latestReportDate: "2025-10-17", lastExpectedReportDate: "2025-10-15" }, "2025-11-10")).toBe(false);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-18T00:00:00Z", latestReportDate: "2025-10-13", lastExpectedReportDate: "2025-10-15" }, "2025-11-10")).toBe(false);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-18T00:00:00Z", latestReportDate: "2025-07-15", lastExpectedReportDate: "2025-10-15" }, "2025-10-21")).toBe(false);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-18T00:00:00Z", latestReportDate: "2025-07-15", lastExpectedReportDate: "2025-10-15" }, "2025-11-01")).toBe(true);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-18T00:00:00Z", latestReportDate: "2025-07-15", lastExpectedReportDate: "2025-07-15" }, "2025-10-21")).toBe(true);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-20T00:00:00Z", latestReportDate: "2025-07-15", lastExpectedReportDate: "2025-10-15" }, "2025-10-21")).toBe(false);
    expect(dueForRefresh("2025-10-15", { attemptedAt: "2025-10-18T00:00:00Z", latestReportDate: "2025-10-15" }, "2025-10-21")).toBe(false);
    expect(dueForRefresh(null, { attemptedAt: "2025-07-13T00:00:00Z", latestReportDate: "2025-07-12" }, "2025-10-21")).toBe(true);
  });
  it("uses one bulk calendar call, forwards the configurable filter and writes nothing in dry-run", async () => {
    const calls: string[] = [];
    const api = {
      earningsCalendar: async (window: { from: string; to: string }) => { calls.push(`calendar:${window.from}:${window.to}`); return calendar; },
      fundamentals: async (symbol: string, filter?: string) => { calls.push(`fundamentals:${symbol}:${filter}`); return fundamentals; },
      getCallCosts: () => ({ calendar: 1, fundamentals: 10 }),
    };
    const result = await runEodhdFundamentals(null, api, { dryRun: true, now: new Date("2025-10-21T12:00:00Z"),
      subjects: [{ ticker: "AAPL", vendorSymbol: "AAPL.US" }], filter: "Financials::Income_Statement::quarterly" });
    expect(calls).toEqual(["calendar:2025-10-07:2026-01-19", "fundamentals:AAPL.US:Financials::Income_Statement::quarterly"]);
    expect(result).toMatchObject({ calendarRows: 1, due: 1, refreshed: 1, facts: 6, eps: 2, calls: 11 });
  });
  it("records a failed symbol and continues with the next one", async () => {
    const calls: string[] = [];
    const api = {
      earningsCalendar: async () => ({ earnings: [] }),
      fundamentals: async (symbol: string) => {
        calls.push(symbol);
        if (symbol === "BAD.US") throw new Error("temporary failure");
        return fundamentals;
      },
      getCallCosts: () => ({ fundamentals: 20, calendar: 1 }),
    };
    const result = await runEodhdFundamentals(null, api, { dryRun: true, now: new Date("2025-10-21T12:00:00Z"), subjects: [
      { ticker: "BAD", vendorSymbol: "BAD.US" }, { ticker: "AAPL", vendorSymbol: "AAPL.US" },
    ] });
    expect(calls).toEqual(["BAD.US", "AAPL.US"]);
    expect(result).toMatchObject({ failures: 1, refreshed: 1, failedSymbols: "BAD", facts: 6 });
  });
  it.each([401, 402, 403])("stops after HTTP %i authorization or allowance errors", async (status) => {
    const calls: string[] = [];
    const { EodhdClient } = await import("../data-providers/eodhd/client");
    const client = new EodhdClient({ apiKey: "test-token", fetch: async (input) => {
      if (String(input).includes("calendar/earnings")) return new Response(JSON.stringify({ earnings: [] }));
      const symbol = String(input).match(/fundamentals\/([^?]+)/)?.[1];
      if (symbol) calls.push(symbol);
      return symbol === "BAD.US" ? new Response("denied", { status }) : new Response(JSON.stringify(fundamentals));
    } });
    const result = await runEodhdFundamentals(null, client, { dryRun: true, now: new Date("2025-10-21T12:00:00Z"), subjects: [
      { ticker: "BAD", vendorSymbol: "BAD.US" }, { ticker: "AAPL", vendorSymbol: "AAPL.US" },
    ] });
    expect(calls).toEqual(["BAD.US"]);
    expect(result).toMatchObject({ failures: 1, refreshed: 0, failedSymbols: "BAD", stoppedEarly: true });
  });
  it("exits nonzero with a failure summary after continuing past a bad fixture", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/jobs/eodhd-fundamentals.ts", "--dry-run",
      "--fixture-dir", "src/data-providers/eodhd/fixtures/offline", "--only", "MISSING.US,AAPL.US", "--as-of", "2025-10-21"],
    { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"refreshed":1');
    expect(result.stdout).toContain('"failures":1');
    expect(result.stdout).toContain('"failedSymbols":"MISSING"');
  });
});

it("revenue score reads EODHD observations only after they were reported and first seen", async () => {
  const { eodhdRevenueStored } = await import("../data/sec");
  const rows = parseEodhdFundamentals(fundamentals, "AAPL", "2025-10-21").rows.filter((row) => row.concept === "Revenues");
  const db: import("../db/history").Queryable = { query: async <R>(_sql: string, args: unknown[] = []) => ({ rows: rows.filter((row) => row.filed >= String(args[1]) && row.filed <= String(args[2]))
    .map((row) => ({ unit: row.unit, period_start: row.periodStart, period_end: row.periodEnd, value: String(row.value), accession: row.accession,
      fy: row.fy, fp: row.fp, filed: row.filed })) as R[] }) };
  const result = await eodhdRevenueStored(db, "AAPL", "2025-10-21");
  expect(result?.revenueAccelerating).toBe(true);
  expect(result?.currentGrowth).toBeCloseTo(30);
  expect(result?.priorGrowth).toBeCloseTo(10);
  expect(await eodhdRevenueStored(db, "AAPL", "2025-10-14")).toBeNull();
});

describe("EODHD sector and industry", () => {
  it("skips a payload without either field", async () => {
    const calls: unknown[] = [];
    await storeClassification({ query: async (...args: unknown[]) => { calls.push(args); return { rows: [] }; } } as never, "SAP.XETRA", { sector: null, industry: null }, "2026-10-21");
    expect(calls).toEqual([]);
  });
  it.skipIf(!process.env.TEST_DATABASE_URL)("keeps the first observed day until the pair changes (Postgres)", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      await pool.query("BEGIN");
      await pool.query("INSERT INTO symbols (vendor_symbol,code,exchange,name,first_seen,last_seen) VALUES ('ZZC.XETRA','ZZC','XETRA','ZZ','2026-01-01','2026-10-21')");
      const read = async () => (await pool.query("SELECT sector,industry,sector_observed_on::text observed FROM symbols WHERE vendor_symbol='ZZC.XETRA'")).rows[0];
      await storeClassification(pool, "ZZC.XETRA", { sector: "Technology", industry: "Semiconductors" }, "2026-10-01");
      await storeClassification(pool, "ZZC.XETRA", { sector: "Technology", industry: "Semiconductors" }, "2026-10-10");
      expect(await read()).toEqual({ sector: "Technology", industry: "Semiconductors", observed: "2026-10-01" });
      await storeClassification(pool, "ZZC.XETRA", { sector: "Technology", industry: "Software - Application" }, "2026-10-15");
      expect(await read()).toEqual({ sector: "Technology", industry: "Software - Application", observed: "2026-10-15" });
      // Sector without Industry keeps the stored industry and the observed day.
      await storeClassification(pool, "ZZC.XETRA", { sector: "Technology", industry: null }, "2026-10-20");
      expect(await read()).toEqual({ sector: "Technology", industry: "Software - Application", observed: "2026-10-15" });
      await storeClassification(pool, "ZZC.XETRA", { sector: "Industrials", industry: null }, "2026-10-21");
      expect(await read()).toEqual({ sector: "Industrials", industry: "Software - Application", observed: "2026-10-21" });
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });
});
