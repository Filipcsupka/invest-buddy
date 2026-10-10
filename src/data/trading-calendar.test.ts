import { describe, expect, it } from "vitest";
import { isEarlyClose, isSession, lastCompletedSession, previousSession, sessionsBetween } from "./trading-calendar";

describe("trading calendar", () => {
  it("closes on Thanksgiving, Christmas 2026 and Good Friday 2027", () => {
    expect(isSession("2026-11-26")).toBe(false);
    expect(isSession("2026-12-25")).toBe(false);
    expect(isSession("2027-03-26")).toBe(false);
  });
  it("treats a half day as a session with an early close", () => {
    expect(isSession("2026-11-27")).toBe(true);
    expect(isEarlyClose("2026-11-27")).toBe(true);
    expect(isEarlyClose("2026-11-30")).toBe(false);
  });
  it("closes on weekends and opens on a normal weekday", () => {
    expect(isSession("2026-10-10")).toBe(false);
    expect(isSession("2026-10-11")).toBe(false);
    expect(isSession("2026-10-09")).toBe(true);
  });
  it("lists sessions and the previous one across a holiday", () => {
    expect(sessionsBetween("2026-11-24", "2026-11-30")).toEqual(["2026-11-24", "2026-11-25", "2026-11-27", "2026-11-30"]);
    expect(previousSession("2026-11-27")).toBe("2026-11-25");
    expect(previousSession("2027-03-29")).toBe("2027-03-25");
  });
  it("rejects bad dates and dates outside the calendar", () => {
    expect(() => isSession("2026-02-30")).toThrow();
    expect(() => isSession("2028-01-03")).toThrow(/outside/);
  });
  it("skips a holiday for the last completed session", () => {
    expect(lastCompletedSession(new Date("2026-11-27T04:50:00Z"))).toBe("2026-11-25"); // morning after Thanksgiving
    expect(lastCompletedSession(new Date("2026-11-27T22:00:00Z"))).toBe("2026-11-27"); // half day, after the close
  });
});
