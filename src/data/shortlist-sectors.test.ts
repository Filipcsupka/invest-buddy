import { describe, expect, it } from "vitest";
import { readListingFacts, sectorGroupsFor } from "./shortlist-sectors";

describe("readListingFacts", () => {
  it("reads one batch with an asOf-bounded vendor classification and maps rows by ticker", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = { query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ ticker: "CHIP", instrument_sector: "Unclassified", vendor_sector: "Technology", vendor_industry: "Semiconductors", currency: "USD" }] };
    } } as never;
    const facts = await readListingFacts(db, ["chip", "CHIP", "bank"], "2026-11-10");
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual([["BANK", "CHIP"], "2026-11-10"]);
    expect(calls[0].sql).toContain("sector_observed_on<=$2::date");
    expect(calls[0].sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(facts.get("CHIP")).toEqual({ ticker: "CHIP", instrumentSector: "Unclassified", vendorSector: "Technology", vendorIndustry: "Semiconductors", currency: "USD" });
  });

  it("skips the query for no tickers", async () => {
    const db = { query: async () => { throw new Error("no query expected"); } } as never;
    expect((await readListingFacts(db, [], "2026-11-10")).size).toBe(0);
  });
});

describe("sectorGroupsFor", () => {
  it("resolves each ticker and falls back to the listing sector, then Unknown", () => {
    const facts = new Map([["CHIP", { instrumentSector: "Unclassified", vendorSector: "Technology", vendorIndustry: null }]]);
    const groups = sectorGroupsFor(["CHIP", "BIO", "NONE"], facts, (ticker) => ticker === "BIO" ? "Biotech" : null);
    expect(Object.fromEntries(groups)).toEqual({
      CHIP: { group: "Technology", source: "vendor-sector" },
      BIO: { group: "Healthcare", source: "instrument" },
      NONE: { group: "Unknown", source: "none" },
    });
  });
});
