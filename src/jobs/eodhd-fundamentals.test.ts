import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEodhdCalendar, parseEodhdFundamentals } from "../data-providers/eodhd/fundamentals";
import type { EarningsCalendar, Fundamentals } from "../data-providers/eodhd/client";
import { dueForRefresh, parseArgs, runEodhdFundamentals } from "./eodhd-fundamentals";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/data-providers/eodhd/fixtures/offline", name), "utf8"));
const fundamentals = fixture("AAPL.US.json") as Fundamentals;
const calendar = fixture("earnings.json") as EarningsCalendar;

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
      Object.fromEntries(ends.map((end, i) => [end, { date: end, filing_date: `${end.slice(0, 7)}-31`, totalRevenue: revenue[i] }])) } } };
    const parsed = parseEodhdFundamentals(payload, "OFF", "2025-10-01");
    const latest = parsed.rows.find((row) => row.periodEnd === "2025-08-31");
    expect(latest?.periodStart).toBe("2025-06-01");
    const { revenueFromCompanyFacts } = await import("../data/sec");
    const facts = parsed.rows.map((row) => ({ start: row.periodStart!, end: row.periodEnd, val: row.value, accn: row.accession,
      fy: row.fy!, fp: row.fp!, form: row.form, filed: row.filed }));
    expect(revenueFromCompanyFacts({ facts: { "us-gaap": { Revenues: { units: { USD: facts } } } } }, "2025-10-01")?.revenueAccelerating).toBe(true);
  });
  it("parses a bulk calendar and filters the requested window", () => {
    expect(parseEodhdCalendar(calendar, "2025-10-01", "2025-10-31")).toMatchObject([{ vendorSymbol: "AAPL.US", reportDate: "2025-10-15", fiscalDateEnding: "2025-09-30", estimate: 2.34 }]);
  });
  it("requires a valid unverified filter value and fixture dry-run arguments", () => {
    expect(parseArgs(["--dry-run", "--fixture-dir", "fixtures", "--only", "AAPL.US", "--filter", "Financials::Income_Statement::quarterly"]).filter).toBe("Financials::Income_Statement::quarterly");
    expect(() => parseArgs(["--fixture-dir", "fixtures", "--only", "AAPL.US"])).toThrow(/dry-run/);
    expect(parseArgs(["--dry-run", "--as-of", "2025-10-21"]).now?.toISOString()).toBe("2025-10-21T12:00:00.000Z");
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
