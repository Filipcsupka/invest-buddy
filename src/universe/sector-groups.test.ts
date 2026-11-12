import { describe, expect, it } from "vitest";
import { ALL_SECTOR_GROUPS, SECTOR_GROUPS, groupFromVendorIndustry, groupFromVendorSector, isSectorGroup, sectorGroup, UNKNOWN_SECTOR } from "./sector-groups";
import { UNCLASSIFIED } from "./sector";

describe("sector groups", () => {
  it("has eleven named sectors plus Unknown", () => {
    expect(SECTOR_GROUPS).toHaveLength(11);
    expect(ALL_SECTOR_GROUPS.at(-1)).toBe(UNKNOWN_SECTOR);
    expect(new Set(ALL_SECTOR_GROUPS).size).toBe(12);
  });

  it("maps every vendor sector name and its GICS spelling, ignoring case and spaces", () => {
    for (const group of SECTOR_GROUPS) expect(groupFromVendorSector(group)).toBe(group);
    expect([" health care ", "INFORMATION TECHNOLOGY", "Financials", "Consumer Discretionary", "Consumer Staples", "Materials"].map(groupFromVendorSector))
      .toEqual(["Healthcare", "Technology", "Financial Services", "Consumer Cyclical", "Consumer Defensive", "Basic Materials"]);
  });

  it("maps known industries and leaves the rest null", () => {
    expect(["Semiconductors", "biotechnology", "Banks - Regional", "Auto Manufacturers", "Oil & Gas E&P", "REIT - Office"].map(groupFromVendorIndustry))
      .toEqual(["Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Energy", "Real Estate"]);
    expect([null, undefined, "", "Shell Companies"].map(groupFromVendorIndustry)).toEqual([null, null, null, null]);
  });

  it("prefers a named instrument sector, then the vendor sector, then the vendor industry", () => {
    expect(sectorGroup({ instrumentSector: "Biotech", vendorSector: "Technology", vendorIndustry: "Semiconductors" })).toEqual({ group: "Healthcare", source: "instrument" });
    expect(sectorGroup({ instrumentSector: UNCLASSIFIED, vendorSector: "Industrials", vendorIndustry: "Semiconductors" })).toEqual({ group: "Industrials", source: "vendor-sector" });
    expect(sectorGroup({ instrumentSector: UNCLASSIFIED, vendorSector: null, vendorIndustry: "Semiconductors" })).toEqual({ group: "Technology", source: "vendor-industry" });
  });

  it("skips thematic labels that span several sectors", () => {
    for (const label of ["Energy & EV", "Growth", "Additional growth", "Discovery", "Sample extension"]) {
      expect(sectorGroup({ instrumentSector: label, vendorSector: "Utilities" })).toEqual({ group: "Utilities", source: "vendor-sector" });
    }
  });

  it("gives Unknown when nothing matches", () => {
    expect(sectorGroup({})).toEqual({ group: UNKNOWN_SECTOR, source: "none" });
    expect(sectorGroup({ instrumentSector: UNCLASSIFIED, vendorSector: "Other", vendorIndustry: "Shell Companies" })).toEqual({ group: UNKNOWN_SECTOR, source: "none" });
  });

  it("recognises group names", () => {
    expect(isSectorGroup("Technology")).toBe(true);
    expect(isSectorGroup(UNKNOWN_SECTOR)).toBe(true);
    expect(isSectorGroup("Growth")).toBe(false);
  });
});
