import { describe, expect, it } from "vitest";
import { stale } from "./store";

const at = (iso: string) => Date.parse(iso);
describe("stale", () => {
  it("is false without a date", () => expect(stale(null)).toBe(false));
  it("keeps a Friday score fresh through Monday and until Tuesday 06:00 UTC", () => {
    expect(stale("2026-10-02", at("2026-10-05T12:00:00Z"))).toBe(false);
    expect(stale("2026-10-02", at("2026-10-06T05:00:00Z"))).toBe(false);
    expect(stale("2026-10-02", at("2026-10-06T07:00:00Z"))).toBe(true);
  });
  it("marks a Wednesday score stale after 3 days", () => {
    expect(stale("2026-10-07", at("2026-10-10T00:00:00Z"))).toBe(false);
    expect(stale("2026-10-07", at("2026-10-10T00:00:01Z"))).toBe(true);
  });
});
