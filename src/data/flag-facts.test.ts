import { describe, expect, it, vi } from "vitest";
import type { FundamentalsHistoryRow } from "../db/history";
import { companyFlags } from "../engine/flags";
import { FUNDAMENTALS_CONCEPTS, INTEREST_EXPENSE_CONCEPTS } from "./fundamentals-concepts";
import { latestShareCounts, pickInterestFacts } from "./flag-facts";
import realCases from "../collectors/sources/fixtures/sec-real-collector-cases.json";
import { parseCompanyfacts } from "../collectors/sources/companyfacts";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db/pool", () => ({ getPool: () => ({ query }) }));

it("reads public share counts only from display-allowed source rows", async () => {
  query.mockResolvedValueOnce({ rows: [{ ticker: "AAPL", value: "100" }] });
  expect(await latestShareCounts(["AAPL"])).toEqual({ AAPL: 100 });
  const sql = String(query.mock.calls.at(-1)?.[0]);
  expect(sql).toMatch(/s\.id\s*=\s*f\.source_id/);
  expect(sql).toMatch(/s\.display_allowed/);
});

const row = (concept: string, value: number, over: Partial<FundamentalsHistoryRow> = {}): FundamentalsHistoryRow => ({
  concept, unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-15", accession: "a-1", value, ...over,
});
const none = {} as Record<string, FundamentalsHistoryRow[]>;

describe("concepts list", () => {
  it("stores operating income and all interest expense concepts", () => {
    const allowed = FUNDAMENTALS_CONCEPTS["us-gaap"];
    expect(allowed.has("OperatingIncomeLoss")).toBe(true);
    expect(INTEREST_EXPENSE_CONCEPTS.length).toBeGreaterThan(0);
    for (const concept of INTEREST_EXPENSE_CONCEPTS) expect(allowed.has(concept)).toBe(true);
  });
});

describe("pickInterestFacts", () => {
  it("reads the latest annual operating income and interest expense from the same period", () => {
    const income = [row("OperatingIncomeLoss", 900), row("OperatingIncomeLoss", 700, { periodStart: "2024-01-01", periodEnd: "2024-12-31", filed: "2025-02-15", accession: "a-0" })];
    const interest = { InterestExpense: [row("InterestExpense", 300), row("InterestExpense", 100, { periodStart: "2024-01-01", periodEnd: "2024-12-31", accession: "a-0" })] };
    expect(pickInterestFacts(income, interest)).toEqual({ operatingIncome: 900, interestExpense: 300 });
  });

  it("falls back to the next interest concept and uses the restated value", () => {
    const income = [row("OperatingIncomeLoss", 500, { filed: "2026-02-15" }), row("OperatingIncomeLoss", 450, { filed: "2027-02-15", accession: "a-2" })];
    const interest = { InterestExpenseNonoperating: [row("InterestExpenseNonoperating", 50)] };
    expect(pickInterestFacts(income, interest)).toEqual({ operatingIncome: 450, interestExpense: 50 });
  });

  it("finds Affirm's annual debt interest but leaves Apple and CRISPR unmatched", () => {
    const facts = (ticker: "AAPL" | "AFRM" | "CRSP") => {
      const rows = parseCompanyfacts(JSON.stringify(realCases[ticker]), ticker).map((fact) => ({
        concept: fact.concept, unit: fact.unit, periodStart: fact.periodStart, periodEnd: fact.periodEnd,
        fy: fact.fy, fp: fact.fp, form: fact.form, filed: fact.filed, accession: fact.accession, value: fact.value,
      }));
      return pickInterestFacts(rows.filter((fact) => fact.concept === "OperatingIncomeLoss"),
        Object.fromEntries(INTEREST_EXPENSE_CONCEPTS.map((concept) => [concept, rows.filter((fact) => fact.concept === concept)])));
    };
    expect(facts("AFRM").interestExpense).toBe(454016000);
    expect(facts("AAPL").interestExpense).toBeNull();
    expect(facts("CRSP").interestExpense).toBeNull();
  });

  it("ignores quarterly, year-to-date and 10-Q facts", () => {
    const income = [
      row("OperatingIncomeLoss", 10, { form: "10-Q", fp: "Q1", periodStart: "2026-01-01", periodEnd: "2026-03-31" }),
      row("OperatingIncomeLoss", 30, { form: "10-Q", fp: "Q3", periodStart: "2026-01-01", periodEnd: "2026-09-30" }),
      row("OperatingIncomeLoss", 800),
    ];
    expect(pickInterestFacts(income, { InterestExpense: [row("InterestExpense", 40)] })).toEqual({ operatingIncome: 800, interestExpense: 40 });
  });

  it("keeps a reported zero as zero", () => {
    expect(pickInterestFacts([row("OperatingIncomeLoss", 200)], { InterestExpense: [row("InterestExpense", 0)] })).toEqual({ operatingIncome: 200, interestExpense: 0 });
  });

  it("returns null interest expense when no concept has the period", () => {
    const other = { InterestExpense: [row("InterestExpense", 40, { periodStart: "2024-01-01", periodEnd: "2024-12-31" })] };
    expect(pickInterestFacts([row("OperatingIncomeLoss", 200)], other)).toEqual({ operatingIncome: 200, interestExpense: null });
  });

  it("returns nulls without annual operating income", () => {
    expect(pickInterestFacts([], none)).toEqual({ operatingIncome: null, interestExpense: null });
    expect(pickInterestFacts([row("OperatingIncomeLoss", 5, { form: "10-Q", fp: "Q2" })], none)).toEqual({ operatingIncome: null, interestExpense: null });
  });

  it("feeds the flag: low cover flagged, zero interest clear, missing no data", () => {
    const state = (facts: ReturnType<typeof pickInterestFacts>) =>
      companyFlags({ bars: [], shares: [], ...facts, shortInterestPercent: null }).find((f) => f.id === "interestCover")!.state;
    expect(state(pickInterestFacts([row("OperatingIncomeLoss", 100)], { InterestExpense: [row("InterestExpense", 100)] }))).toBe("flagged");
    expect(state(pickInterestFacts([row("OperatingIncomeLoss", 100)], { InterestExpense: [row("InterestExpense", 0)] }))).toBe("clear");
    expect(state(pickInterestFacts([row("OperatingIncomeLoss", 100)], none))).toBe("no-data");
  });
});
