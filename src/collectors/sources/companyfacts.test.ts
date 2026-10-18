import pg from "pg";
import { describe, expect, it } from "vitest";
import { collectCompanyfacts, companyfactsUrl, parseCompanyfacts } from "./companyfacts";
import realCases from "./fixtures/sec-real-collector-cases.json";

const fixture = (revision = false) => JSON.stringify({ cik: 1045810, facts: {
  "us-gaap": {
    Revenues: { units: { USD: [
      { start: "2025-01-01", end: "2025-03-31", val: 100, accn: "d18-test-1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
      ...(revision ? [{ start: "2025-01-01", end: "2025-03-31", val: 120, accn: "d18-test-2", fy: 2025, fp: "Q1", form: "10-Q/A", filed: "2025-06-01" }] : []),
    ] } },
    IgnoreThis: { units: { USD: [{ end: "2025-03-31", val: 999, accn: "x", filed: "2025-05-01", form: "10-Q" }] } },
  },
  dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: "2025-03-31", val: 12, accn: "d18-test-1", filed: "2025-05-01", form: "10-Q" }] } } },
} });

describe("SEC companyfacts", () => {
  it("uses the concept allow-list and preserves units and filing dates", () => {
    const rows = parseCompanyfacts(fixture(), "NVDA");
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(expect.objectContaining({ taxonomy: "dei", unit: "shares", concept: "EntityCommonStockSharesOutstanding" }));
    expect(rows).toContainEqual(expect.objectContaining({ concept: "Revenues", filed: "2025-05-01", value: 100 }));
  });
  it("formats a ten digit CIK", () => expect(companyfactsUrl(1045810)).toMatch(/CIK0001045810\.json$/));
  it("keeps Alphabet's replacement revenue tag and common shares", () => {
    const rows = parseCompanyfacts(JSON.stringify(realCases.GOOGL), "GOOGL");
    expect(rows).toContainEqual(expect.objectContaining({ concept: "Revenues", periodEnd: "2026-06-30", periodStart: "2026-04-01" }));
    expect(rows).toContainEqual(expect.objectContaining({ concept: "CommonStockSharesOutstanding", periodEnd: "2026-06-30", unit: "shares" }));
  });
  it("keeps Affirm's annual debt interest expense", () => {
    const rows = parseCompanyfacts(JSON.stringify(realCases.AFRM), "AFRM");
    expect(rows).toContainEqual(expect.objectContaining({ concept: "InterestExpenseDebt", periodEnd: "2026-06-30", form: "10-K" }));
  });
  it("does not invent a common-share count for Meta", () => {
    const rows = parseCompanyfacts(JSON.stringify(realCases.META), "META");
    expect(rows.some((row) => row.concept === "CommonStockSharesOutstanding" || row.concept === "EntityCommonStockSharesOutstanding")).toBe(false);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("SEC companyfacts (Postgres)", () => {
  it("stores once, retains a restatement, and replays by filed date", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const key = "companyfacts:1045810";
    let body = fixture();
    const http = { get: async () => body };
    try {
      await pool.query("DELETE FROM fundamentals_pit WHERE ticker='NVDA' AND accession LIKE 'd18-test-%'");
      await pool.query("DELETE FROM raw_snapshots WHERE source_id='sec' AND key=$1", [key]);
      expect((await collectCompanyfacts(pool, http, "NVDA", 1045810, true)).inserted).toBe(0);
      expect((await pool.query("SELECT count(*)::int AS n FROM raw_snapshots WHERE source_id='sec' AND key=$1", [key])).rows[0].n).toBe(0);
      expect((await collectCompanyfacts(pool, http, "NVDA", 1045810)).inserted).toBe(2);
      expect((await collectCompanyfacts(pool, http, "NVDA", 1045810)).inserted).toBe(0);
      body = fixture(true);
      expect((await collectCompanyfacts(pool, http, "NVDA", 1045810)).inserted).toBe(1);
      const old = await pool.query("SELECT value::text FROM fundamentals_as_of('2025-05-31') WHERE ticker='NVDA' AND concept='Revenues' AND accession LIKE 'd18-test-%'");
      expect(old.rows.map((row) => row.value)).toEqual(["100"]);
      const latest = await pool.query("SELECT value::text FROM fundamentals_as_of('2025-06-01') WHERE ticker='NVDA' AND concept='Revenues' AND accession LIKE 'd18-test-%' ORDER BY filed");
      expect(latest.rows.map((row) => row.value)).toEqual(["100", "120"]);
      const snapshots = await pool.query("SELECT count(*)::int AS n FROM raw_snapshots WHERE source_id='sec' AND key=$1", [key]);
      expect(snapshots.rows[0].n).toBe(2);
    } finally {
      await pool.query("DELETE FROM fundamentals_pit WHERE ticker='NVDA' AND accession LIKE 'd18-test-%'");
      await pool.query("DELETE FROM raw_snapshots WHERE source_id='sec' AND key=$1", [key]);
      await pool.end();
    }
  });
});
