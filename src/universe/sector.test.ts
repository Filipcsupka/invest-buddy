import { describe, expect, it } from "vitest";
import { sectorFromSic, UNCLASSIFIED } from "./sector";

describe("sectorFromSic", () => {
  it("maps SIC codes to existing sector names", () => {
    expect([2834, 3674, 7372, 6199, 1311].map(sectorFromSic)).toEqual(["Biotech", "AI & semiconductors", "Cloud & SaaS", "Fintech", "Energy & EV"]);
  });
  it("falls back to Unclassified for unmapped, missing or null codes", () => {
    expect([1040, 9999, null, undefined].map(sectorFromSic)).toEqual([UNCLASSIFIED, UNCLASSIFIED, UNCLASSIFIED, UNCLASSIFIED]);
  });
});
