import { describe, expect, it } from "vitest";
import { eodhdClassification, sectorFromEodhd, sectorFromSic, UNCLASSIFIED } from "./sector";

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
