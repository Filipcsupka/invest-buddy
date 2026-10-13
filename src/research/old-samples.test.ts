import { describe, expect, it } from "vitest";
import fixture from "./fixtures/old-samples.json";
import { isOldSamples, validateOldSamples } from "./old-samples";

const fresh = () => structuredClone(fixture) as unknown as { samples: Record<string, unknown>[] } & Record<string, unknown>;

describe("old sample fixture", () => {
  it("is valid and holds the six names", () => {
    expect(validateOldSamples(fixture)).toEqual([]);
    expect(isOldSamples(fixture)).toBe(true);
    expect(fixture.samples.map((s) => s.ticker)).toEqual(["MRVL", "GMAB", "GFS", "INTT", "MEDCL", "EOS.AX"]);
  });

  it("keeps the resolved card dates and leaves MRVL open", () => {
    const dates = Object.fromEntries(fixture.samples.map((s) => [s.ticker, s.cardDate]));
    expect(dates).toEqual({ MRVL: null, GMAB: "2026-10-08", GFS: "2026-10-09", INTT: "2026-10-09", MEDCL: "2026-10-10", "EOS.AX": "2026-10-11" });
  });

  it("rejects bad input", () => {
    expect(validateOldSamples(null)).toEqual(["$: expected an object"]);
    const dup = fresh(); dup.samples[1].ticker = "MRVL";
    expect(validateOldSamples(dup).join()).toContain("duplicate MRVL");
    const date = fresh(); date.samples[1].cardDate = "2026-02-30";
    expect(validateOldSamples(date).join()).toContain("cardDate");
    const kind = fresh(); kind.samples[2].kind = "rumour";
    expect(validateOldSamples(kind).join()).toContain("kind");
    const action = fresh(); action.samples[2].oldAction = "BUY";
    expect(validateOldSamples(action).join()).toContain("oldAction");
    const amount = fresh(); amount.samples[0].trigger = "Raised target to USD 20B";
    expect(validateOldSamples(amount).join()).toContain("no amounts");
    const note = fresh(); note.samples[0].dateNote = "unknown";
    expect(validateOldSamples(note).join()).toContain("no day");
    const extra = fresh(); extra.samples[0].amountEur = 50;
    expect(validateOldSamples(extra).join()).toContain("unknown field");
    const few = fresh(); few.samples.pop();
    expect(validateOldSamples(few).join()).toContain("expected 6");
  });
});
