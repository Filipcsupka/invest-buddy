import { describe, expect, it } from "vitest";
import { hasBuySize, publicTier, showsOnCompanyPage, stripEur, withoutEur } from "./public";
import { sampleIdeas } from "./fixtures";

describe("public idea helpers", () => {
  it("shows the company card only for actionable actions", () => {
    for (const a of ["WATCH", "START_POSITION", "ADD", "HIGH_CONVICTION_ADD", "REDUCE", "THESIS_BROKEN"]) expect(showsOnCompanyPage({ action: a as never })).toBe(true);
    for (const a of ["HOLD", "CSPX_ALLOCATION"]) expect(showsOnCompanyPage({ action: a as never })).toBe(false);
  });
  it("removes sentences with EUR amounts and keeps the rest", () => {
    expect(withoutEur("Stronger setup. Cash left: EUR 510.")).toBe("Stronger setup.");
    expect(withoutEur("Add 50 € now.")).toBeNull();
    expect(withoutEur("Price fell 7.4% from the high.")).toBe("Price fell 7.4% from the high.");
  });
  it("leaves no EUR anywhere in a stripped sample idea and keeps the size tier", () => {
    for (const idea of sampleIdeas) {
      expect(JSON.stringify(stripEur(idea))).not.toMatch(/EUR|€/);
      expect(stripEur(idea).sizeTier).toBe(idea.sizeTier);
      expect([stripEur(idea).amountMinEur, stripEur(idea).amountMaxEur]).toEqual([0, 0]);
    }
  });
  it("a buy size is any tier but NONE; an idea from before tiers has none", () => {
    expect(hasBuySize(publicTier({ sizeTier: "STARTER" }))).toBe(true);
    expect(hasBuySize(publicTier({ sizeTier: "NONE" }))).toBe(false);
    expect(publicTier({ sizeTier: null })).toBeNull();
    expect(hasBuySize(null)).toBe(false);
  });
});
