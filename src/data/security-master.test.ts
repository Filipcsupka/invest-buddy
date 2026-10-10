import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import universe from "../../scanner/universe.json";
import { loadStoredCiks, loadVendorSymbols, resolveCik } from "./security-master";
import { DEFAULT_SYMBOL_MAP } from "./twelvedata";

const fakeDb = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;
const missingTable = { query: async () => { throw Object.assign(new Error('relation "instrument_ids" does not exist'), { code: "42P01" }); } } as never;

describe("security master lookup", () => {
  it("resolves SQ to XYZ for Twelve Data and for SEC from stored rows", async () => {
    const db = fakeDb([{ ticker: "SQ", vendor_symbols: { twelvedata: "XYZ", sec: "XYZ" } }, { ticker: "NVDA", vendor_symbols: {} }]);
    expect((await loadVendorSymbols(db, "twelvedata")).SQ).toBe("XYZ");
    expect((await loadVendorSymbols(db, "sec")).SQ).toBe("XYZ");
    expect((await loadVendorSymbols(db, "sec")).NVDA).toBeUndefined();
  });

  it("applies a ticker change fixture: a stored row overrides the constant", async () => {
    const db = fakeDb([{ ticker: "SQ", vendor_symbols: { twelvedata: "XYZ2" } }, { ticker: "OLD", vendor_symbols: { sec: "NEW" } }]);
    expect((await loadVendorSymbols(db, "twelvedata")).SQ).toBe("XYZ2");
    expect((await loadVendorSymbols(db, "sec")).OLD).toBe("NEW");
    expect((await loadVendorSymbols(db, "sec")).SQ).toBe("XYZ");
  });

  it("falls back to the constant when the table is missing or a row has no vendor symbol, and rethrows other errors", async () => {
    expect(await loadVendorSymbols(missingTable, "twelvedata")).toEqual(DEFAULT_SYMBOL_MAP);
    expect(await loadVendorSymbols(fakeDb([{ ticker: "SQ", vendor_symbols: {} }]), "twelvedata")).toEqual(DEFAULT_SYMBOL_MAP);
    await expect(loadVendorSymbols({ query: async () => { throw new Error("connection lost"); } } as never, "sec")).rejects.toThrow("connection lost");
    expect((await loadStoredCiks(missingTable)).size).toBe(0);
  });

  it("reads stored CIKs and prefers them over the SEC ticker list", async () => {
    const stored = await loadStoredCiks(fakeDb([{ ticker: "SQ", cik: "1512673" }]));
    expect(stored.get("SQ")).toBe(1512673);
    const sec = new Map([["XYZ", 7], ["SQ", 8], ["NVDA", 1045810]]);
    expect(resolveCik("SQ", stored, sec)).toBe(1512673);
    expect(resolveCik("SQ", new Map(), new Map([["XYZ", 7]]))).toBe(7);
    expect(resolveCik("NVDA", new Map(), sec)).toBe(1045810);
    expect(resolveCik("NVDA", new Map(), undefined)).toBeUndefined();
  });
});

describe("migration 026", () => {
  const sql = readFileSync(join(process.cwd(), "migrations", "026_instrument_ids.sql"), "utf8");
  it("is additive: no drop, no alter, no delete", () => {
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|TRUNCATE)\b/i);
  });
  it("has the spec columns and seeds only the guide, sample, discovery and benchmark names", () => {
    for (const column of ["ticker", "cik", "figi", "composite_figi", "exchange", "currency", "sic", "sic_description", "fiscal_year_end", "vendor_symbols", "status", "valid_from", "valid_to"]) expect(sql).toContain(column);
    expect(sql).toContain("'guide', 'sample extension', 'discovery', 'benchmark'");
    expect(sql).toContain('"twelvedata": "XYZ"');
  });
  it("matches a universe of 36 names (SPY is the 37th)", () => { expect(universe.instruments).toHaveLength(36); });
});
