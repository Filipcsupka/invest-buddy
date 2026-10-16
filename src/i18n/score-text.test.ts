import { afterEach, describe, expect, it } from "vitest";
import { scoredUniverse } from "@/data/scored";
import { rejectionChecks, ruleGroups, rulePointsText, ruleThreshold, sectorLabel } from "./score-text";

const original = process.env.DATA_MODE;
afterEach(() => { if (original === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = original; });

it("hides the fixture sector label on live rows in both languages", () => {
  process.env.DATA_MODE = "db";
  expect(sectorLabel("en", "Sample extension")).toBe("Screening universe");
  expect(sectorLabel("sk", "Sample extension")).toBe("Zoznam sledovaných akcií");
  process.env.DATA_MODE = "fixture";
  expect(sectorLabel("sk", "Sample extension")).toBe("Ukážkové rozšírenie");
});

describe("rule thresholds, points of possible and rejection checks", () => {
  it("states the threshold of every rule from the engine constants, in both languages", () => {
    expect(ruleThreshold("en", "dip")).toBe("Needs: close 5% to 10% below the 20-day high while the uptrend rule holds");
    expect(ruleThreshold("sk", "dip")?.replace(/\s/g, " ")).toContain("5 % až 10 %");
    expect(ruleThreshold("en", "accumulation")).toContain("1.25 times");
    expect(ruleThreshold("sk", "accumulation")).toContain("1,25-násobok");
    expect(ruleThreshold("en", "green-volume")).toContain("1.2 times");
    expect(ruleThreshold("en", "uptrend")).toContain("10 sessions");
    for (const rule of ruleGroups.flatMap((group) => group.rules)) {
      expect(ruleThreshold("en", rule.id), rule.id).toMatch(/^Needs: /);
      expect(ruleThreshold("sk", rule.id), rule.id).toMatch(/^Vyžaduje: /);
    }
  });

  it("shows points as n of possible, or no data", () => {
    expect(rulePointsText("en", "met", 3)).toBe("+3 of 3");
    expect(rulePointsText("en", "not-met", 3)).toBe("0 of 3");
    expect(rulePointsText("en", "no-data", 3)).toBe("No data");
    expect(rulePointsText("sk", "met", 4)).toBe("+4 z 4");
    expect(rulePointsText("sk", "not-met", 2)).toBe("0 z 2");
    expect(rulePointsText("sk", "no-data", 2)).toBe("Bez údajov");
  });

  it("lists all five rejection checks with a state and value", async () => {
    const result = (await scoredUniverse())[0].result;
    for (const locale of ["en", "sk"] as const) {
      const checks = rejectionChecks(locale, result);
      expect(checks.map((check) => check.id)).toEqual(["revenue", "earningsMiss", "belowMa200", "ma50BelowMa200", "noRevenue"]);
      for (const check of checks) {
        expect(check.threshold, check.id).not.toBe("");
        expect(check.value, check.id).not.toBe("");
      }
    }
    const f = result.inputs.fundamentals;
    const triggered = rejectionChecks("en", { ...result, inputs: { ...result.inputs, fundamentals: { ...f, revenueDeclining: false, revenueGrowthCurrent: -3, earningsMissAndGuidanceCut: null, noRevenue: false, memePump: true } } });
    expect(triggered.find((check) => check.id === "revenue")?.state).toBe("triggered");
    expect(triggered.find((check) => check.id === "earningsMiss")?.state).toBe("no-data");
    expect(triggered.find((check) => check.id === "noRevenue")?.state).toBe("triggered");
  });
});
