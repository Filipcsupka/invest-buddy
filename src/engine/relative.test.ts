import { describe, expect, it } from "vitest";
import { ruleGroups } from "../i18n/rules";
import { absoluteBand, evidencedMaxOf, hasEvidence, meetsGuidePoints, meetsPercent, POINTS_MAX, RELATIVE_RULES, relativeScore } from "./relative";

const rules = ruleGroups.flatMap((group) => group.rules);
const hits = (unknown: string[] = [], matched: string[] = []) => rules.map((rule) => ({ id: rule.id, points: rule.points, matched: matched.includes(rule.id), unknown: unknown.includes(rule.id) }));

describe("relative scoring (EN45)", () => {
  it("keeps the 25-point table and the Guide thresholds on a fully evidenced ticker", () => {
    expect(rules.reduce((sum, rule) => sum + rule.points, 0)).toBe(POINTS_MAX);
    expect(RELATIVE_RULES).toEqual({ setupPercent: 72, watchPercent: 60, waitPercent: 48, minEvidencedPoints: 20 });
    for (let total = 0; total <= POINTS_MAX; total++) expect(relativeScore(total, POINTS_MAX).band, String(total)).toBe(absoluteBand(total));
    expect(relativeScore(18, 25).percent).toBe(72);
    expect(relativeScore(17, 25).band).toBe("watch");
  });

  it("leaves an unknown rule out and counts a known unmet rule as 0", () => {
    expect(evidencedMaxOf(hits())).toBe(25);
    expect(evidencedMaxOf(hits(["catalyst"]))).toBe(23);
    expect(evidencedMaxOf(hits(["catalyst", "revenue-acceleration"]))).toBe(19);
    // A matched rule always has evidence, even with an unknown flag.
    expect(hasEvidence({ matched: true, unknown: true })).toBe(true);
    expect(hasEvidence({ matched: false, unknown: true })).toBe(false);
    expect(hasEvidence({ matched: false })).toBe(true);
    expect(evidencedMaxOf(hits(["revenue-acceleration"], ["revenue-acceleration"]))).toBe(25);
  });

  it("measures the total against the evidenced points", () => {
    // Live 2026-10-09 shape: catalyst unknown, 17 of 23 is 73.9%.
    expect(relativeScore(17, 23)).toEqual({ evidencedMax: 23, percent: 73.9, coverage: 92, incompleteData: false, band: "setup", capped: false });
    expect(relativeScore(14, 23).band).toBe("watch"); // 60.9%
    expect(relativeScore(13, 23).band).toBe("wait"); // 56.5%
    expect(relativeScore(11, 23).band).toBe("ignore"); // 47.8%
  });

  it("uses exact integer boundaries", () => {
    expect(meetsPercent(18, 25, 72)).toBe(true);
    expect(meetsPercent(17, 25, 72)).toBe(false);
    expect(meetsPercent(12, 25, 48)).toBe(true);
    expect(meetsPercent(11, 25, 48)).toBe(false);
    expect(meetsPercent(0, 0, 0)).toBe(false);
    expect(meetsGuidePoints(15, 20, 18)).toBe(true); // 75% >= 72%
    expect(meetsGuidePoints(14, 20, 18)).toBe(false); // 70%
    expect(meetsGuidePoints(18, 25, 18)).toBe(true);
  });

  it("caps the best band at watch under 20 evidenced points and flags incomplete data", () => {
    expect(relativeScore(16, 20)).toMatchObject({ band: "setup", incompleteData: false, capped: false });
    expect(relativeScore(18, 19)).toMatchObject({ band: "watch", incompleteData: true, capped: true, percent: 94.7, coverage: 76 });
    expect(relativeScore(6, 10)).toMatchObject({ band: "watch", incompleteData: true, capped: false });
    expect(relativeScore(4, 10)).toMatchObject({ band: "ignore", incompleteData: true, capped: false });
  });

  it("handles no evidence and out of range input", () => {
    expect(relativeScore(0, 0)).toEqual({ evidencedMax: 0, percent: 0, coverage: 0, incompleteData: true, band: "ignore", capped: false });
    expect(relativeScore(20, 40).evidencedMax).toBe(25);
    expect(relativeScore(0, -5).evidencedMax).toBe(0);
  });
});
