import { describe, expect, it } from "vitest";
import { extendedOn, pageScoreRow, scoreExtended, scoredMember, scoringMember } from "./universe";

describe("SCORE_EXTENDED switch", () => {
  it("needs both SCORE_EXTENDED=on and EODHD_PRIVATE_USE=on", () => {
    expect(scoreExtended({})).toBe(false);
    expect(scoreExtended({ SCORE_EXTENDED: "on" })).toBe(false);
    expect(scoreExtended({ EODHD_PRIVATE_USE: "on" })).toBe(false);
    expect(scoreExtended({ SCORE_EXTENDED: "true", EODHD_PRIVATE_USE: "on" })).toBe(false);
    expect(scoreExtended({ SCORE_EXTENDED: "on", EODHD_PRIVATE_USE: "on" })).toBe(true);
  });
  it("scoringMember equals scoredMember unless the switch is on", () => {
    expect(scoringMember("m", {})).toBe(scoredMember("m"));
    expect(scoringMember("m", { SCORE_EXTENDED: "on" })).toBe(scoredMember("m"));
    const on = scoringMember("m", { SCORE_EXTENDED: "on", EODHD_PRIVATE_USE: "on" });
    expect(on).not.toContain("extended");
    expect(on).toContain("benchmark");
    expect(scoredMember("m")).toContain("'extended'");
  });
  it("extendedOn checks the collect-only list on the given date", () => {
    expect(extendedOn("s.ticker", "s.as_of")).toContain("x.list='extended' AND x.valid_from <= s.as_of AND (x.valid_to IS NULL OR x.valid_to > s.as_of)");
  });
  it("pageScoreRow reads stored-fact rows only in private mode", () => {
    expect(pageScoreRow("s", {})).toBe("s.audit ? 'scanRunId'");
    expect(pageScoreRow("s", { EODHD_PRIVATE_USE: "on" })).toBe("(s.audit ? 'scanRunId' OR s.audit ? 'agreement')");
  });
});
