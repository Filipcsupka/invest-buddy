import { describe, expect, it } from "vitest";
import { isIsoDate, isoDate } from "./iso-date";

describe("isIsoDate", () => {
  it("accepts real calendar days, including a leap day", () => {
    for (const day of ["2026-10-05", "2024-02-29", "2026-12-31"]) expect(isIsoDate(day), day).toBe(true);
  });
  it("rejects shapes that are not a date and days that roll over", () => {
    for (const day of ["2026-02-30", "2026-13-01", "2025-02-29", "2026-00-10", "2026-10-5", "20261005", "2026-10-05T00:00:00Z", "", "today"]) expect(isIsoDate(day), day).toBe(false);
  });
  it("works as a zod field", () => {
    expect(isoDate().safeParse("2026-10-05").success).toBe(true);
    expect(isoDate().safeParse("2026-02-30").success).toBe(false);
    expect(isoDate().safeParse(20261005).success).toBe(false);
  });
});
