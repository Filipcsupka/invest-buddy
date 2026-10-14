import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCollectorRepository } from "../../db/collectors";
import { EPS_FACT_KEY } from "../../data/eps";
import { collectAlphaVantage, documentUrl, MAX_REQUESTS_PER_DAY, MAX_REQUESTS_PER_RUN, parseEarnings, parseEarningsHistory, pickSymbols, redact } from "./alphavantage";
import { runExtraSources } from "./registry";
import { MemoryUsageLedger } from "../../data/usage";
import { context, stubHttp, type Call } from "./testing";

/** Shape of the documented EARNINGS answer, written by hand for the tests (not a captured live response). */
const earnings = (symbol: string, rows: Record<string, string>[]) => JSON.stringify({ symbol, annualEarnings: [], quarterlyEarnings: rows });
const quarter = (reportedDate: string, surprisePercentage: string, over: Record<string, string> = {}) =>
  ({ fiscalDateEnding: "2026-07-31", reportedDate, reportedEPS: "1.05", estimatedEPS: "1.00", surprise: "0.05", surprisePercentage, reportTime: "post-market", ...over });
const KEY = "AVKEY9Q7XSECRET";
const symbols = Array.from({ length: 30 }, (_, i) => `S${String(i).padStart(2, "0")}`);
const companies = symbols.map((symbol) => ({ symbol, name: symbol }));
const answerAll = (call: Call) => earnings(new URL(call.url).searchParams.get("symbol") ?? "", [quarter("2026-08-27", "5.0"), quarter("2026-05-28", "-2.0")]);

afterEach(() => { vi.restoreAllMocks(); });

describe("parseEarnings", () => {
  it("takes the newest reported quarter on or before today", () => {
    const text = earnings("NVDA", [quarter("2026-05-28", "-2.0"), quarter("2026-08-27", "4.5"), quarter("2026-11-20", "1.0")]);
    expect(parseEarnings(text, "2026-10-05")).toEqual({ reportedDate: "2026-08-27", fiscalDateEnding: "2026-07-31", reportedEps: 1.05, estimatedEps: 1, surprisePercent: 4.5 });
  });
  it("keeps a missing estimate as null and skips rows without a reported EPS", () => {
    const text = earnings("NVDA", [quarter("2026-08-27", "None", { reportedEPS: "None" }), quarter("2026-05-28", "None", { estimatedEPS: "None" })]);
    expect(parseEarnings(text, "2026-10-05")).toMatchObject({ reportedDate: "2026-05-28", estimatedEps: null, surprisePercent: null });
    expect(parseEarnings(earnings("NVDA", []), "2026-10-05")).toBeUndefined();
  });
  it("treats Information and Note answers as the limit and Error Message as a bad call", () => {
    expect(() => parseEarnings(JSON.stringify({ Information: "rate limit is 25 requests per day" }), "2026-10-05")).toThrow(/25 requests per day/);
    expect(() => parseEarnings(JSON.stringify({ "Error Message": "Invalid API call" }), "2026-10-05")).toThrow(/Invalid API call/);
  });
});

describe("pickSymbols", () => {
  it("puts symbols never fetched first, then the oldest observation", () => {
    const latest = new Map([["A", "2026-08-01"], ["B", "2026-05-01"], ["D", "2026-09-01"]]);
    expect(pickSymbols(["A", "B", "C", "D"], latest, 3)).toEqual(["C", "B", "A"]);
    expect(pickSymbols(["A"], latest, 0)).toEqual([]);
  });
});

describe("collectAlphaVantage", () => {
  it("sends nothing without a key", async () => {
    const http = stubHttp(answerAll);
    const output = await collectAlphaVantage(context(http, { env: {}, state: new MemoryCollectorRepository() }));
    expect(http.calls).toEqual([]);
    expect(output).toMatchObject({ documents: [], facts: [], apiRequests: 0, skipped: expect.stringContaining("ALPHA_VANTAGE_API_KEY") });
  });

  it("stores a non-display document and an eps_surprise_latest fact per symbol, keyed by report date, expiring after 100 days", async () => {
    const http = stubHttp(answerAll);
    const output = await collectAlphaVantage(context(http, { symbols: ["NVDA", "SQ"], env: { ALPHA_VANTAGE_API_KEY: KEY }, state: new MemoryCollectorRepository() }));
    expect(http.calls.map((call) => new URL(call.url).searchParams.get("symbol"))).toEqual(["NVDA", "XYZ"]);
    expect(output.facts[0]).toEqual({ symbol: "NVDA", key: EPS_FACT_KEY, asOf: "2026-08-27", documentUrls: [documentUrl("NVDA", "2026-08-27")], expiresAt: "2026-12-05",
      value: { reportedDate: "2026-08-27", fiscalDateEnding: "2026-07-31", reportedEps: 1.05, estimatedEps: 1, surprisePercent: 5, source: "alphavantage", displayAllowed: false } });
    expect(output.documents[0]).toMatchObject({ source: "alphavantage", symbol: "NVDA", docType: "EPS surprise", publishedAt: "2026-08-27T00:00:00Z", meta: { display_allowed: false } });
    expect(output.documents[1].url).toBe("https://www.alphavantage.co/query?function=EARNINGS&symbol=XYZ#2026-08-27");
    expect(output.apiRequests).toBe(2);
  });

  it("caps one run at 20 requests and picks never fetched, then oldest observations", async () => {
    const repo = new MemoryCollectorRepository();
    for (const [i, symbol] of symbols.slice(0, 15).entries()) repo.epsHistory.push({ ticker: symbol, fiscalDateEnding: "2026-07-31", reportedDate: null, reportedEps: null, estimatedEps: null, surprisePct: null, observedAt: `2026-0${(i % 9) + 1}-15T00:00:00.000Z` });
    const http = stubHttp(answerAll);
    const output = await collectAlphaVantage(context(http, { companies, symbols, env: { ALPHA_VANTAGE_API_KEY: KEY }, state: repo }));
    expect(MAX_REQUESTS_PER_RUN).toBe(20);
    expect(http.calls).toHaveLength(20);
    const asked = http.calls.map((call) => new URL(call.url).searchParams.get("symbol"));
    expect(asked.slice(0, 15)).toEqual(symbols.slice(15));
    expect(asked.slice(15)).toEqual(["S00", "S09", "S01", "S10", "S02"]);
    expect(output.apiRequests).toBe(20);
  });

  it("counts earlier runs of the same UTC day against the daily cap", async () => {
    const repo = new MemoryCollectorRepository();
    await repo.recordRun({ startedAt: "2026-10-05T01:00:00.000Z", sources: ["alphavantage"], requested: 1, succeeded: 1, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null, apiRequests: { alphavantage: 17 } });
    await repo.recordRun({ startedAt: "2026-10-04T23:00:00.000Z", sources: ["alphavantage"], requested: 1, succeeded: 1, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null, apiRequests: { alphavantage: 20 } });
    const http = stubHttp(answerAll);
    const output = await collectAlphaVantage(context(http, { companies, symbols, env: { ALPHA_VANTAGE_API_KEY: KEY }, state: repo }));
    expect(http.calls).toHaveLength(MAX_REQUESTS_PER_DAY - 17);
    await repo.recordRun({ startedAt: "2026-10-05T12:00:00.000Z", sources: ["alphavantage"], requested: 1, succeeded: 1, failures: [], documentsWritten: 0, factsWritten: 0, stoppedReason: null, apiRequests: { alphavantage: output.apiRequests! } });
    const again = stubHttp(answerAll);
    const blocked = await collectAlphaVantage(context(again, { companies, symbols, env: { ALPHA_VANTAGE_API_KEY: KEY }, state: repo }));
    expect(again.calls).toEqual([]);
    expect(blocked.skipped).toMatch(/daily cap of 20/);
  });

  it("stops at a limit answer and lists the rest as not fetched", async () => {
    let n = 0;
    const http = stubHttp((call) => ++n === 2 ? JSON.stringify({ Information: "limit reached" }) : answerAll(call));
    const output = await collectAlphaVantage(context(http, { symbols: ["NVDA", "PLTR", "SQ", "GOOGL"], env: { ALPHA_VANTAGE_API_KEY: KEY }, state: new MemoryCollectorRepository() }));
    expect(http.calls).toHaveLength(2);
    expect(output.apiRequests).toBe(2);
    expect(output.facts.map((fact) => fact.symbol)).toEqual(["GOOGL"]);
    expect(output.failures).toEqual([
      { ticker: "NVDA", reason: "Alpha Vantage: limit reached" },
      { ticker: "PLTR", reason: "not fetched: Alpha Vantage limit" },
      { ticker: "SQ", reason: "not fetched: Alpha Vantage limit" },
    ]);
  });

  it("never puts the key into stored urls, documents, facts, failures, the run record or the log", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const http = stubHttp((call) => {
      if (call.url.includes("symbol=PLTR")) throw new Error(`HTTP 500 at ${call.url}`);
      return answerAll(call);
    });
    const repo = new MemoryCollectorRepository();
    const result = await runExtraSources(repo, ["alphavantage"], { since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), http, companies: [{ symbol: "NVDA", name: "NVIDIA" }, { symbol: "PLTR", name: "Palantir" }], symbols: ["NVDA", "PLTR"], env: { ALPHA_VANTAGE_API_KEY: KEY } });
    expect(http.calls.every((call) => call.url.includes(`apikey=${KEY}`))).toBe(true);
    const everything = JSON.stringify({ documents: [...repo.documents.values()], facts: [...repo.facts.values()], runs: repo.runs, result, stderr: stderr.mock.calls, stdout: stdout.mock.calls });
    expect(everything).not.toContain(KEY);
    expect(result.failures).toEqual([{ ticker: "PLTR", reason: expect.stringContaining("[redacted]") }]);
    expect(repo.runs[0].apiRequests).toEqual({ alphavantage: 2 });
    expect([...repo.facts.values()][0]).toMatchObject({ key: EPS_FACT_KEY, expiresAt: "2026-12-05" });
  });

  it("records the request count even on a dry run, so the daily cap holds", async () => {
    const repo = new MemoryCollectorRepository();
    await runExtraSources(repo, ["alphavantage"], { since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), dryRun: true, http: stubHttp(answerAll), companies: [{ symbol: "NVDA", name: "NVIDIA" }], symbols: ["NVDA"], env: { ALPHA_VANTAGE_API_KEY: KEY } });
    expect(repo.documents.size).toBe(0);
    expect(repo.facts.size).toBe(0);
    expect(repo.runs).toHaveLength(1);
    expect(repo.runs[0].apiRequests).toEqual({ alphavantage: 1 });
  });

  it("redacts the raw and url-encoded key", () => {
    expect(redact("a k+y/ b k%2By%2F", "k+y/")).toBe("a [redacted] b [redacted]");
    expect(redact("text", undefined)).toBe("text");
  });
});

describe("usage ledger", () => {
  it("reserves each request and stops before sending when the ledger cap is reached", async () => {
    const ledger = new MemoryUsageLedger({ alphavantage: { dailyCap: 3, monthlyCostCapEur: 0 } });
    const http = stubHttp(answerAll);
    const output = await collectAlphaVantage(context(http, { companies, symbols, env: { ALPHA_VANTAGE_API_KEY: KEY }, state: new MemoryCollectorRepository(), usage: ledger }));
    expect(http.calls).toHaveLength(3);
    expect(output.apiRequests).toBe(3);
    expect(ledger.rows.reduce((n, row) => n + row.requests, 0)).toBe(3);
    expect(output.failures?.[0].reason).toMatch(/daily cap 3/);
  });
});

describe("EPS history (D28)", () => {
  const FISCAL = ["2024-10-31", "2025-01-31", "2025-04-30", "2025-07-31", "2025-10-31", "2026-01-31", "2026-04-30", "2026-07-31"];
  const REPORTED = ["2024-11-20", "2025-02-26", "2025-05-28", "2025-08-27", "2025-11-19", "2026-02-25", "2026-05-27", "2026-08-26"];
  const eight = (estimate = (i: number) => String(1 + i / 10)) => FISCAL.map((fiscalDateEnding, i) => quarter(REPORTED[i], "5.0", { fiscalDateEnding, estimatedEPS: estimate(i) }));
  const run = (repo: MemoryCollectorRepository, rows: Record<string, string>[], now = "2026-10-05T12:00:00Z") => runExtraSources(repo, ["alphavantage"], { since: "2026-09-05", now: new Date(now), http: stubHttp((call) => earnings(new URL(call.url).searchParams.get("symbol") ?? "", rows)), companies: [{ symbol: "NVDA", name: "NVIDIA" }], symbols: ["NVDA"], env: { ALPHA_VANTAGE_API_KEY: KEY } });

  it("parses every quarter, oldest first, and keeps missing numbers as null", () => {
    const rows = parseEarningsHistory(earnings("NVDA", [...eight(), quarter("2026-11-20", "None", { fiscalDateEnding: "2026-10-31", reportedEPS: "None", estimatedEPS: "None" })]));
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual({ fiscalDateEnding: "2024-10-31", reportedDate: "2024-11-20", reportedEps: 1.05, estimatedEps: 1, surprisePct: 5 });
    expect(rows[8]).toMatchObject({ reportedEps: null, estimatedEps: null, surprisePct: null });
  });

  it("stores 8 quarters, a rerun adds none, a revised estimate adds one row and the old row stays", async () => {
    const repo = new MemoryCollectorRepository();
    await run(repo, eight());
    expect(repo.epsHistory).toHaveLength(8);
    await run(repo, eight(), "2026-10-12T12:00:00Z");
    expect(repo.epsHistory).toHaveLength(8);
    await run(repo, eight((i) => i === 7 ? "1.20" : String(1 + i / 10)), "2026-10-19T12:00:00Z");
    const last = repo.epsHistory.filter((r) => r.fiscalDateEnding === "2026-07-31");
    expect(repo.epsHistory).toHaveLength(9);
    expect(last.map((r) => r.estimatedEps)).toEqual([1.7, 1.2]);
    expect(JSON.stringify(repo.epsHistory)).not.toContain(KEY);
  });

  it("still writes the existing fact", async () => {
    const repo = new MemoryCollectorRepository();
    await run(repo, eight());
    expect([...repo.facts.values()][0]).toMatchObject({ key: EPS_FACT_KEY, asOf: "2026-08-26" });
  });
});

describe("symbol rotation and history failures", () => {
  const rows = [quarter("2026-08-27", "5.0")];
  const noQuarter = [quarter("2027-08-27", "5.0")];
  it("a symbol with only unreported quarters has history and is not picked ahead of older ones", async () => {
    const repo = new MemoryCollectorRepository();
    repo.epsHistory.push({ ticker: "A", fiscalDateEnding: "2026-07-31", reportedDate: "2027-08-27", reportedEps: null, estimatedEps: 1, surprisePct: null, observedAt: "2026-10-01T00:00:00.000Z" });
    repo.epsHistory.push({ ticker: "B", fiscalDateEnding: "2026-07-31", reportedDate: "2026-08-27", reportedEps: 1, estimatedEps: 1, surprisePct: 0, observedAt: "2026-09-01T00:00:00.000Z" });
    const http = stubHttp((call) => earnings(new URL(call.url).searchParams.get("symbol") ?? "", noQuarter));
    await collectAlphaVantage(context(http, { symbols: ["A", "B", "C"], env: { ALPHA_VANTAGE_API_KEY: KEY }, state: repo }));
    expect(http.calls.map((call) => new URL(call.url).searchParams.get("symbol"))).toEqual(["C", "B", "A"]);
  });
  it("a failing eps history write is recorded and the facts are still stored", async () => {
    const repo = new MemoryCollectorRepository();
    repo.upsertEpsHistory = async () => { throw new Error("db down"); };
    const result = await runExtraSources(repo, ["alphavantage"], { since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), http: stubHttp((call) => earnings(new URL(call.url).searchParams.get("symbol") ?? "", rows)), companies: [{ symbol: "NVDA", name: "NVIDIA" }], symbols: ["NVDA"], env: { ALPHA_VANTAGE_API_KEY: KEY } });
    expect(result.factsWritten).toBe(1);
    expect(result.failures).toEqual([{ ticker: "NVDA", reason: "eps history not stored: db down" }]);
    expect(result.exitCode).toBe(1);
  });
});
