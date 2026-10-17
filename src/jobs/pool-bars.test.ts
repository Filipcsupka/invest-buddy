import { describe, expect, it } from "vitest";
import { needsBars, parsePoolBarsArgs } from "./pool-bars";

describe("pool-bars", () => {
  it("defaults to 250 requests and a 300 name pool", () => {
    expect(parsePoolBarsArgs([])).toEqual({ limit: 250, size: 300, minYoy: 15 });
    expect(parsePoolBarsArgs(["--limit", "50"]).limit).toBe(50);
  });
  it("rejects unknown or non-numeric options", () => {
    expect(() => parsePoolBarsArgs(["--limit", "x"])).toThrow();
    expect(() => parsePoolBarsArgs(["--all", "1"])).toThrow();
  });
  it("needs bars when history is short or stale, not when covered", () => {
    expect(needsBars({ count: 0, newest: null }, "2026-10-17")).toBe(true);
    expect(needsBars({ count: 150, newest: "2026-10-16" }, "2026-10-17")).toBe(true);
    expect(needsBars({ count: 260, newest: "2026-10-01" }, "2026-10-17")).toBe(true);
    expect(needsBars({ count: 260, newest: "2026-10-16" }, "2026-10-17")).toBe(false);
  });
});
