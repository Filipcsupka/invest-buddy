import { describe, expect, it } from "vitest";
import form4 from "../data-providers/eodhd/fixtures/form4.json";
import { dueForInsiderFallback, parseEodhdInsider, parseSharesAfter, runEodhdInsider, type InsiderSubject } from "./eodhd-insider";

const subject = (changes: Partial<InsiderSubject> = {}): InsiderSubject => ({ ticker: "AAPL", vendorSymbol: "AAPL.US",
  secCheckedAt: null, vendorCheckedAt: null, secFailed: true, ...changes });

describe("EODHD Form 4 fallback", () => {
  it("only schedules when SEC is stale or failed and the paid refresh is due", () => {
    expect(dueForInsiderFallback(subject({ secCheckedAt: "2026-10-20", secFailed: false }), "2026-10-21")).toBe(false);
    expect(dueForInsiderFallback(subject({ secCheckedAt: "2026-10-20", secFailed: true }), "2026-10-21")).toBe(true);
    expect(dueForInsiderFallback(subject({ secCheckedAt: "2026-10-17", vendorCheckedAt: "2026-10-20" }), "2026-10-21")).toBe(false);
    expect(dueForInsiderFallback(subject({ secCheckedAt: "2026-10-17", vendorCheckedAt: "2026-10-18" }), "2026-10-21")).toBe(true);
  });

  it("parses only non-derivative P/S lines with their original line positions", () => {
    const filing = { ...form4.data[0], non_derivative: [
      { ...form4.data[0].non_derivative[0], transaction_code: "M" },
      form4.data[0].non_derivative[0],
    ] };
    expect(parseEodhdInsider(filing, "2026-10-21")).toMatchObject([{ lineNo: 2, code: "S", shares: 3000,
      ownerCik: "0001771340", filedAt: "2026-05-15" }]);
    expect(() => parseEodhdInsider({ ...filing, accession_number: "bad" }, "2026-10-21")).toThrow();
  });

  it("runs a fixture dry run without writes and accounts for pages", async () => {
    let calls = 0;
    const api = { async form4() { calls++; return { ...form4, links: { next: null } }; }, getCallCosts: () => ({ "sec-filings/form4": calls * 10 }) };
    const result = await runEodhdInsider(null, api, { dryRun: true, subjects: [subject()], today: "2026-05-16" });
    expect(result).toMatchObject({ due: 1, refreshed: 1, rows: 1, calls: 10, failures: [] });
    expect(calls).toBe(1);
    expect(await runEodhdInsider(null, null, { dryRun: true, subjects: [subject()], today: "2026-05-16" }))
      .toMatchObject({ planned: 1, estimatedCalls: 10, refreshed: 0 });
  });

  it("isolates a failed symbol", async () => {
    const api = { async form4(symbol: string) { if (symbol === "AAPL.US") throw new Error("bad page"); return { data: [], links: { next: null } }; },
      getCallCosts: () => ({ "sec-filings/form4": 20 }) };
    const result = await runEodhdInsider(null, api, { dryRun: true, subjects: [subject(), subject({ ticker: "MSFT", vendorSymbol: "MSFT.US" })] });
    expect(result).toMatchObject({ refreshed: 1, failures: ["AAPL"] });
  });

  it("backs off 30 days per symbol after an empty result", () => {
    const etf = subject({ vendorEmpty: true, vendorCheckedAt: "2026-10-10" });
    expect(dueForInsiderFallback(etf, "2026-10-21")).toBe(false);
    expect(dueForInsiderFallback({ ...etf, vendorCheckedAt: "2026-09-20" }, "2026-10-21")).toBe(true);
    expect(dueForInsiderFallback({ ...etf, vendorEmpty: false }, "2026-10-21")).toBe(true);
  });

  it("records an empty refresh so the next run skips the symbol", async () => {
    const writes: unknown[][] = [];
    const db = { async query(sql: string, params?: unknown[]) { if (sql.includes("eodhd_insider_refresh")) writes.push(params ?? []); return { rows: [], rowCount: 0 }; } };
    const api = { async form4() { return { data: [], links: { next: null } }; }, getCallCosts: () => ({ "sec-filings/form4": 10 }) };
    await runEodhdInsider(db as never, api, { subjects: [subject({ ticker: "SPY", vendorSymbol: "SPY.US" })], today: "2026-10-21" });
    expect(writes).toEqual([["SPY", true]]);
  });

  it("does not stop paging on a page whose order is unproven", async () => {
    const filing = (day: string, n: number) => ({ ...form4.data[0], accession_number: `0001104659-26-${String(n).padStart(6, "0")}`, filed_at: day, non_derivative: [] });
    const pages = [
      { data: [filing("2026-10-01", 1), filing("2026-01-01", 2), filing("2026-10-10", 3)], links: { next: "n" } }, // old row in the middle, not sorted
      { data: [filing("2026-10-05", 4)], links: { next: null } },
    ];
    let calls = 0;
    const api = { async form4() { return pages[calls++]; }, getCallCosts: () => ({}) };
    const result = await runEodhdInsider(null, api, { dryRun: true, subjects: [subject()], today: "2026-10-21" });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ refreshed: 1, incomplete: [] });
  });

  it("stops early when newest-first order is proven by the pages read", async () => {
    const filing = (day: string, n: number) => ({ ...form4.data[0], accession_number: `0001104659-26-${String(n).padStart(6, "0")}`, filed_at: day, non_derivative: [] });
    let calls = 0;
    const api = { async form4() { calls++; return { data: [filing("2026-10-01", 1), filing("2026-01-01", 2)], links: { next: "n" } }; }, getCallCosts: () => ({}) };
    await runEodhdInsider(null, api, { dryRun: true, subjects: [subject()], today: "2026-10-21" });
    expect(calls).toBe(1);
  });

  it("flags a symbol incomplete when the page budget ends without proof, and keeps its rows out of the fact", async () => {
    const queries: string[] = [];
    const db = { async query(sql: string) { queries.push(sql); return { rows: [], rowCount: 0 }; } };
    let calls = 0;
    // each page is newer than the last, so order is never proven and the window is never passed
    const api = { async form4() { calls++; return { data: [{ ...form4.data[0], accession_number: `0001104659-26-${String(calls).padStart(6, "0")}`, filed_at: `2026-10-${String(10 + calls).padStart(2, "0")}` }], links: { next: "n" } }; }, getCallCosts: () => ({}) };
    const result = await runEodhdInsider(db as never, api, { subjects: [subject()], today: "2026-10-21" });
    expect(calls).toBe(5);
    expect(result).toMatchObject({ refreshed: 1, failures: [], incomplete: ["AAPL"] });
    expect(queries.some((sql) => sql.includes("insider_transactions") && sql.includes("INSERT"))).toBe(true);
    expect(queries.some((sql) => sql.includes("collected_facts"))).toBe(false);
  });

  it("parses shares_owned_after tolerantly", () => {
    expect(parseSharesAfter(18106.5)).toBe(18106.5);
    expect(parseSharesAfter("1,200")).toBeNull();
    expect(parseSharesAfter("N/A")).toBeNull();
    expect(parseSharesAfter(Number.NaN)).toBeNull();
    expect(parseSharesAfter(null)).toBeNull();
    const tx = { ...form4.data[0].non_derivative[0], shares_owned_after: "N/A", acquired_or_disposed: "X" } as never;
    expect(parseEodhdInsider({ ...form4.data[0], non_derivative: [tx] }, "2026-10-21"))
      .toMatchObject([{ sharesAfter: null, acquiredDisposed: null, shares: 3000 }]);
  });

  it("skips an EODHD line when SEC already holds the accession, and EDGAR later replaces EODHD rows", async () => {
    const inserts: { sql: string; params: unknown[] }[] = [];
    const db = { async query(sql: string, params: unknown[] = []) { if (sql.includes("INSERT INTO insider_transactions")) inserts.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
    const api = { async form4() { return { data: form4.data, links: { next: null } }; }, getCallCosts: () => ({}) };
    await runEodhdInsider(db as never, api, { subjects: [subject()], today: "2026-05-16" });
    expect(inserts).toHaveLength(1);
    // the same statement carries the guard: no insert when a sec row exists for the accession
    expect(inserts[0].sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM insider_transactions WHERE accession=\$1 AND source_id='sec'\)/);
    expect(inserts[0].params[0]).toBe("0001104659-26-062860");
  });
});
