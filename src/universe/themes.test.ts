import { describe, expect, it } from "vitest";
import { SECTOR_GROUPS } from "./sector-groups";
import { ALL_THEMES, MULTI_THEME_GROUPS, THEMES, isTheme, themeFromGroup, themeFromIndustry, themeFromInstrumentSector, themeOf } from "./themes";

describe("theme map", () => {
  it("lists ten named themes and Unknown", () => {
    expect(THEMES).toHaveLength(10);
    expect(ALL_THEMES.at(-1)).toBe("unknown");
    expect(isTheme("robotics")).toBe(true);
    expect(isTheme("Technology")).toBe(false);
  });

  it("maps the six thematic instrument labels and skips the rest", () => {
    expect(themeFromInstrumentSector("AI & semiconductors")).toBe("ai-semis");
    expect(themeFromInstrumentSector(" cloud &  saas ")).toBe("cloud-software");
    expect(themeFromInstrumentSector("Cybersecurity")).toBe("cybersecurity");
    expect(themeFromInstrumentSector("Biotech")).toBe("healthcare");
    expect(themeFromInstrumentSector("Fintech")).toBe("fintech");
    expect(themeFromInstrumentSector("Energy & EV")).toBe("energy-ev");
    for (const label of ["Unclassified", "Growth", "Discovery", "Sample extension", "Additional growth", "Benchmark", null, ""]) expect(themeFromInstrumentSector(label)).toBeNull();
  });

  it("maps vendor industries, including robotics and automation", () => {
    expect(themeFromIndustry("Semiconductors")).toBe("ai-semis");
    expect(themeFromIndustry("Software - Infrastructure")).toBe("cloud-software");
    expect(themeFromIndustry("Specialty Industrial Machinery")).toBe("robotics");
    expect(themeFromIndustry("Scientific & Technical Instruments")).toBe("robotics");
    expect(themeFromIndustry("Biotechnology")).toBe("healthcare");
    expect(themeFromIndustry("Credit Services")).toBe("fintech");
    expect(themeFromIndustry("Utilities - Renewable")).toBe("energy-ev");
    expect(themeFromIndustry("Aerospace & Defense")).toBe("industrials");
    expect(themeFromIndustry("Internet Retail")).toBe("consumer");
    expect(themeFromIndustry("Banks - Regional")).toBe("other");
    expect(themeFromIndustry("Something new")).toBeNull();
  });

  it("falls back to the sector group only where the group has one theme", () => {
    expect(themeFromGroup("Healthcare")).toBe("healthcare");
    expect(themeFromGroup("Utilities")).toBe("energy-ev");
    expect(themeFromGroup("Consumer Defensive")).toBe("consumer");
    expect(themeFromGroup("Technology")).toBeNull();
    expect(themeFromGroup("Unknown")).toBeNull();
    expect(MULTI_THEME_GROUPS).toEqual(["Technology", "Financial Services", "Communication Services"]);
    expect(SECTOR_GROUPS.filter((group) => !MULTI_THEME_GROUPS.includes(group)).every((group) => themeFromGroup(group))).toBe(true);
  });

  it("resolves instrument label, then industry, then sector group, then Unknown", () => {
    expect(themeOf({ instrumentSector: "Cloud & SaaS", vendorSector: "Consumer Cyclical", vendorIndustry: "Internet Retail" })).toEqual({ theme: "cloud-software", source: "instrument" });
    expect(themeOf({ instrumentSector: "Sample extension", vendorSector: "Technology", vendorIndustry: "Semiconductor Equipment & Materials" })).toEqual({ theme: "ai-semis", source: "vendor-industry" });
    expect(themeOf({ instrumentSector: "Unclassified", vendorSector: "Health Care", vendorIndustry: "Unlisted industry" })).toEqual({ theme: "healthcare", source: "sector-group" });
    expect(themeOf({ instrumentSector: "Unclassified", vendorSector: "Technology", vendorIndustry: null })).toEqual({ theme: "unknown", source: "none" });
    expect(themeOf({})).toEqual({ theme: "unknown", source: "none" });
  });
});
