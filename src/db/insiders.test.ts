import { describe, expect, it } from "vitest";
import type pg from "pg";
import { insiderEvents } from "./insiders";

describe("insider events", () => {
  it("reads only displayable SEC rows in the current universe and builds a filing URL", async () => {
    let sql = "";
    let params: unknown[] = [];
    const db = { query: async (query: string, values: unknown[]) => {
      sql = query; params = values;
      return { rows: [{ accession: "0001045810-26-000123", lineNo: 1, ticker: "NVDA", ownerName: "Jane Doe",
        reportingOwners: [], isDirector: true, isOfficer: false, isTenPercentOwner: false, isOther: false,
        transactionDate: "2026-10-02", filedAt: "2026-10-04", code: "P", shares: "100.5", value: "2512.50", cik: "1045810" }] };
    } } as unknown as pg.Pool;
    const rows = await insiderEvents("NVDA", db);
    expect(params).toEqual(["NVDA", 40]);
    expect(sql).toContain("t.display_allowed = true");
    expect(sql).toContain("s.display_allowed = true");
    expect(sql).toContain("universe_membership");
    expect(sql).toContain("ids.valid_to IS NULL");
    expect(rows[0]).toMatchObject({ shares: 100.5, value: 2512.5,
      secUrl: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/" });
  });

  it("keeps rows and omits the SEC link when the instrument has no CIK", async () => {
    let sql = "";
    const db = { query: async (query: string) => {
      sql = query;
      return { rows: [{ accession: "0001045810-26-000123", lineNo: 1, ticker: "NVDA", ownerName: "Jane Doe",
        reportingOwners: [], isDirector: true, isOfficer: false, isTenPercentOwner: false, isOther: false,
        transactionDate: "2026-10-02", filedAt: "2026-10-04", code: "P", shares: "100", value: null, cik: null }] };
    } } as unknown as pg.Pool;
    const rows = await insiderEvents(undefined, db);
    expect(sql).toContain("LEFT JOIN instrument_ids");
    expect(sql).not.toContain("cik IS NOT NULL");
    expect(rows).toHaveLength(1);
    expect(rows[0].secUrl).toBeNull();
  });

  it("returns no fixture rows without a database", async () => {
    expect(await insiderEvents(undefined, null)).toEqual([]);
  });
});
