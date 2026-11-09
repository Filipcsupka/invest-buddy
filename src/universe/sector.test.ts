import { describe, expect, it } from "vitest";
import { eodhdClassification, sectorForCandidate, sectorFromEodhd, sectorFromSic, UNCLASSIFIED } from "./sector";
import { loadCandidates } from "./candidates";

describe("sectorFromSic", () => {
  it("maps SIC codes to existing sector names", () => {
    expect([2834, 3674, 7372, 6199, 1311].map(sectorFromSic)).toEqual(["Biotech", "AI & semiconductors", "Cloud & SaaS", "Fintech", "Energy & EV"]);
  });
  it("falls back to Unclassified for unmapped, missing or null codes", () => {
    expect([1040, 9999, null, undefined].map(sectorFromSic)).toEqual([UNCLASSIFIED, UNCLASSIFIED, UNCLASSIFIED, UNCLASSIFIED]);
  });
});

describe("sectorFromEodhd", () => {
  it("maps EODHD industries to the existing sector names, ignoring case and spaces", () => {
    expect(["Semiconductors", "software - application", " Biotechnology ", "Credit Services", "Auto Manufacturers"].map(sectorFromEodhd))
      .toEqual(["AI & semiconductors", "Cloud & SaaS", "Biotech", "Fintech", "Energy & EV"]);
  });
  it("leaves unknown, broad or missing industries Unclassified", () => {
    expect(["Technology", "Banks - Regional", "", null, undefined].map(sectorFromEodhd)).toEqual(Array(5).fill(UNCLASSIFIED));
  });
  it("reads trimmed General.Sector and General.Industry", () => {
    expect(eodhdClassification({ Sector: " Technology ", Industry: "Semiconductors" })).toEqual({ sector: "Technology", industry: "Semiconductors" });
    expect(eodhdClassification({ Sector: "", Industry: 7 })).toEqual({ sector: null, industry: null });
    expect(eodhdClassification(undefined)).toEqual({ sector: null, industry: null });
  });
});

describe("sectorForCandidate", () => {
  it("fills an Unclassified US or European sector from a known EODHD industry", () => {
    expect(sectorForCandidate(UNCLASSIFIED, "Semiconductors")).toBe("AI & semiconductors");
    expect(sectorForCandidate(UNCLASSIFIED, "Software - Application")).toBe("Cloud & SaaS");
  });
  it("keeps a named sector and leaves unknown industries Unclassified", () => {
    expect(sectorForCandidate("Biotech", "Semiconductors")).toBe("Biotech");
    expect(sectorForCandidate(UNCLASSIFIED, "Banks - Regional")).toBe(UNCLASSIFIED);
  });
  it("uses dated EODHD industry for Unclassified US candidates without replacing named sectors", async () => {
    const names = [
      { ticker: "CHIP", name: "Chip", sector: UNCLASSIFIED, vendor_symbol: "CHIP.US", exchange: "US", currency: "USD", type: "Common Stock", current_exchange: "US", industry: "Semiconductors", isin: null },
      { ticker: "BANK", name: "Bank", sector: UNCLASSIFIED, vendor_symbol: "BANK.US", exchange: "US", currency: "USD", type: "Common Stock", current_exchange: "US", industry: "Banks - Regional", isin: null },
      { ticker: "BIO", name: "Bio", sector: "Biotech", vendor_symbol: "BIO.US", exchange: "US", currency: "USD", type: "Common Stock", current_exchange: "US", industry: "Semiconductors", isin: null },
    ];
    const db = { query: async (sql: string) => ({ rows: sql.includes("FROM instruments i") ? names : [] }) } as never;
    const candidates = await loadCandidates(db, "2026-10-21");
    expect(Object.fromEntries(candidates.map((row) => [row.ticker, row.sector])))
      .toEqual({ CHIP: "AI & semiconductors", BANK: UNCLASSIFIED, BIO: "Biotech" });
  });
});
