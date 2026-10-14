import { describe, expect, it } from "vitest";
import { lastScheduledAt, parseCron } from "./cron";

const iso = (d: Date | null) => d?.toISOString() ?? null;
const TZ = "Europe/Bratislava";

describe("cron", () => {
  it("finds the last weekday-range run in local time (CEST, UTC+2)", () => {
    // Wed 2026-10-14 08:00 local. "25 4 * * 2-6" ran today at 04:25 local = 02:25 UTC.
    expect(iso(lastScheduledAt("25 4 * * 2-6", TZ, new Date("2026-10-14T06:00:00Z")))).toBe("2026-10-14T02:25:00.000Z");
  });
  it("skips Sunday and Monday for Tuesday to Saturday jobs", () => {
    // Mon 2026-10-12 12:00 local: last run was Sat 2026-10-10 04:25 local.
    expect(iso(lastScheduledAt("25 4 * * 2-6", TZ, new Date("2026-10-12T10:00:00Z")))).toBe("2026-10-10T02:25:00.000Z");
  });
  it("returns the same instant when asked exactly at a run time, and the previous one a second earlier", () => {
    expect(iso(lastScheduledAt("0 3 * * *", TZ, new Date("2026-10-14T01:00:00Z")))).toBe("2026-10-14T01:00:00.000Z");
    expect(iso(lastScheduledAt("0 3 * * *", TZ, new Date("2026-10-14T00:59:59Z")))).toBe("2026-10-13T01:00:00.000Z");
  });
  it("uses the winter offset after the clock change (CET, UTC+1)", () => {
    expect(iso(lastScheduledAt("0 3 * * *", TZ, new Date("2026-12-01T12:00:00Z")))).toBe("2026-12-01T02:00:00.000Z");
  });
  it("handles a UTC job and a Sunday-only job", () => {
    expect(iso(lastScheduledAt("0 6 * * 2-6", "UTC", new Date("2026-10-14T12:00:00Z")))).toBe("2026-10-14T06:00:00.000Z");
    expect(iso(lastScheduledAt("0 18 * * 0", TZ, new Date("2026-10-14T12:00:00Z")))).toBe("2026-10-11T16:00:00.000Z");
  });
  it("handles a yearly job by looking back far enough", () => {
    expect(iso(lastScheduledAt("0 8 20 11 *", TZ, new Date("2026-10-14T12:00:00Z")))).toBe("2025-11-20T07:00:00.000Z");
  });
  it("accepts 7 as Sunday, lists and steps", () => {
    expect([...parseCron("0 0 * * 7").dow]).toEqual([0]);
    expect([...parseCron("*/20 1,2 * * *").minute]).toEqual([0, 20, 40]);
  });
  it("rejects malformed expressions", () => {
    expect(() => parseCron("* * * *")).toThrow();
    expect(() => parseCron("61 * * * *")).toThrow();
  });
});
