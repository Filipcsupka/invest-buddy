import { describe, expect, it } from "vitest";
import { eventNote, upcomingMacroEvents } from "./macro-calendar";

describe("macro calendar", () => {
  it("finds nothing on a quiet day", () => {
    expect(upcomingMacroEvents("2026-10-15")).toEqual([]);
    expect(eventNote([])).toBeNull();
  });
  it("counts sessions to the FOMC decision", () => {
    expect(upcomingMacroEvents("2026-10-23").map((e) => [e.kind, e.sessions])).toEqual([["FOMC", 3]]);
    expect(upcomingMacroEvents("2026-10-28")[0].sessions).toBe(0);
  });
  it("skips past events and counts from a weekend", () => {
    expect(upcomingMacroEvents("2026-10-29")).toEqual([]);
    expect(upcomingMacroEvents("2026-11-07").map((e) => e.kind)).toEqual(["CPI"]);
  });
  it("builds a flag note", () => {
    expect(eventNote(upcomingMacroEvents("2026-11-09"))).toContain("CPI (October) 2026-11-10 (in 1 session)");
  });
});
