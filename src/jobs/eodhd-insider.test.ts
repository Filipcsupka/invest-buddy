import { describe, expect, it } from "vitest";
import form4 from "../data-providers/eodhd/fixtures/form4.json";
import { dueForInsiderFallback, parseEodhdInsider, runEodhdInsider, type InsiderSubject } from "./eodhd-insider";

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
});
