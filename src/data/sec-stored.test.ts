import { describe, expect, it } from "vitest";
import fixture from "./fixtures/sec-companyfacts.json";
import msft from "./fixtures/sec-msft-synthetic.json";
import { revenueLookup, secRevenueStored, type CompanyFacts, type SecFact } from "./sec";
import { reconcileField } from "../jobs/reconcile";
import type { Queryable } from "../db/history";

type Stored = { concept: string; unit: string; periodStart: string | null; periodEnd: string; fy: number | null; fp: string | null; form: string; filed: string; accession: string; value: number };
const CIK = 1045810;

/** Rows as fundamentals_pit stores them, built from a companyfacts fixture. */
function rowsOf(data: CompanyFacts, edit: (fact: SecFact) => SecFact | null = (fact) => fact): Stored[] {
  const out: Stored[] = [];
  for (const [concept, entry] of Object.entries(data.facts["us-gaap"] ?? {})) for (const [unit, facts] of Object.entries(entry.units))
    for (const raw of facts) { const fact = edit({ ...raw }); if (fact) out.push({ concept, unit, periodStart: fact.start ?? null, periodEnd: fact.end, fy: fact.fy, fp: fact.fp, form: fact.form, filed: fact.filed, accession: fact.accn, value: fact.val }); }
  return out;
}

/** Fake pool: instrument_ids holds the CIK; the fundamentals_pit query returns the rows of the asked concept (sec display flag on or off). */
function fake(rows: Stored[], opts: { cik?: number | null; display?: boolean } = {}) {
  const calls: string[] = [];
  const db: Queryable = { query: async (text: string, params: unknown[] = []) => {
    calls.push(text);
    if (text.includes("FROM instrument_ids")) return { rows: (opts.cik === null ? [] : [{ cik: String(opts.cik ?? CIK) }]) as never[] };
    if (opts.display === false) return { rows: [] };
    const [, concept, from, to] = params as [string, string, string | null, string | null];
    const hit = rows.filter((r) => r.concept === concept && (!from || r.filed >= from) && (!to || r.filed <= to))
      .sort((a, b) => b.filed.localeCompare(a.filed)).map((r, i) => ({ ...r, value: String(r.value), cursorKey: `${r.filed}:${i}` }));
    return { rows: hit as never[] };
  } };
  return { db, calls };
}

describe("secRevenueStored", () => {
  it("accelerating: current growth above prior, SEC companyfacts URL as source", async () => {
    const result = await secRevenueStored(fake(rowsOf(fixture)).db, "NVDA", "2025-08-05");
    expect(result).toMatchObject({ revenueAccelerating: true, revenueDeclining: false, period: "Q2 FY2026", source: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json" });
    expect(result?.currentGrowth).toBeCloseTo(50);
    expect(result?.priorGrowth).toBeCloseTo(20);
  });

  it("decelerating: current growth below prior", async () => {
    const rows = rowsOf(fixture, (f) => (f.fp === "Q2" && f.fy === 2026 && f.start === "2025-04-01" ? { ...f, val: 110 } : f));
    const result = await secRevenueStored(fake(rows).db, "NVDA", "2025-08-05");
    expect(result).toMatchObject({ revenueAccelerating: false, revenueDeclining: false });
    expect(result?.currentGrowth).toBeCloseTo(10);
  });

  it("uses the Q4 derived from FY minus Q1 to Q3", async () => {
    const result = await secRevenueStored(fake(rowsOf(msft)).db, "MSFT", "2026-10-09");
    expect(result).toMatchObject({ period: "Q4 FY2026", revenueAccelerating: true });
    expect(result?.detail).toContain("derived from 10-K");
  });

  it("missing quarter: unknown, not false", async () => {
    const rows = rowsOf(fixture, (f) => (f.fy === 2026 && f.fp === "Q1" ? null : f));
    expect(await secRevenueStored(fake(rows).db, "NVDA", "2025-08-05")).toBeNull();
  });

  it("ignores facts filed after the as-of date", async () => {
    expect(await secRevenueStored(fake(rowsOf(fixture)).db, "NVDA", "2025-07-01")).toBeNull();
  });

  it("foreign filer (20-F, 6-K only): unknown", async () => {
    const rows = rowsOf(fixture, (f) => ({ ...f, form: f.fp === "Q1" || f.fp === "Q2" ? "6-K" : "20-F" }));
    expect(await secRevenueStored(fake(rows).db, "TSM", "2025-08-05")).toBeNull();
  });

  it("no stored facts, no CIK, or sec display flag off: unknown", async () => {
    expect(await secRevenueStored(fake([]).db, "NVDA", "2025-08-05")).toBeNull();
    expect(await secRevenueStored(fake(rowsOf(fixture), { cik: null }).db, "NVDA", "2025-08-05")).toBeNull();
    expect(await secRevenueStored(fake(rowsOf(fixture), { display: false }).db, "NVDA", "2025-08-05")).toBeNull();
  });
});

describe("revenueLookup", () => {
  const live = { currentGrowth: 1, priorGrowth: 0, revenueAccelerating: true, revenueDeclining: false, period: "Q1 FY1", source: "https://data.sec.gov/live" };
  it("prefers stored facts, falls back to live only without a stored answer", async () => {
    const stored = await revenueLookup(fake(rowsOf(fixture)).db, async () => live)("NVDA", "2025-08-05");
    expect(stored?.period).toBe("Q2 FY2026");
    expect(await revenueLookup(fake([]).db, async () => live)("NVDA", "2025-08-05")).toBe(live);
    expect(await revenueLookup(fake([]).db)("NVDA", "2025-08-05")).toBeNull();
  });
});

describe("reconcile with stored revenue", () => {
  it("writes revenueAccelerating from SEC data with the companyfacts filing as evidence; foreign filer stays unknown", async () => {
    const verify = async () => false;
    const sec = await secRevenueStored(fake(rowsOf(fixture)).db, "NVDA", "2025-08-05");
    const field = await reconcileField("NVDA", "revenueAccelerating", "2025-08-05", [], verify, sec);
    expect(field).toMatchObject({ value: true, verified: true, agreement: "xbrl_override" });
    expect(field.evidenceRefs[0]).toMatchObject({ url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json", fiscalPeriod: "Q2 FY2026" });
    const foreign = await reconcileField("TSM", "revenueAccelerating", "2025-08-05", [], verify, null);
    expect(foreign).toMatchObject({ value: null, verified: false });
  });
});
