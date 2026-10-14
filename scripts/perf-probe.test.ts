import { describe, expect, it } from "vitest";
import { percentile, summarize, urlList } from "./perf-probe.mjs";

describe("percentile", () => {
  it("uses nearest rank on unsorted input", () => {
    const v = [50, 10, 40, 20, 30];
    expect(percentile(v, 50)).toBe(30);
    expect(percentile(v, 95)).toBe(50);
    expect(percentile(v, 0)).toBe(10);
    expect(percentile(v, 100)).toBe(50);
  });
  it("handles one value and empty input", () => {
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
  it("does not change the input", () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe("summarize", () => {
  it("counts statuses and leaves failed requests out of timings", () => {
    const s = summarize([
      { status: 200, ttfbMs: 100, totalMs: 150 },
      { status: 200, ttfbMs: 300, totalMs: 350 },
      { status: 503, ttfbMs: 20, totalMs: 25 },
      { status: 0, ttfbMs: 0, totalMs: 3000 },
    ]);
    expect(s.n).toBe(4);
    expect(s.status).toEqual({ 200: 2, 503: 1, 0: 1 });
    expect(s.ttfbP50).toBe(100);
  });
});

describe("urlList", () => {
  it("covers both locales and trims the base", () => {
    const u = urlList("https://example.test/");
    expect(u).toHaveLength(12);
    expect(u).toContain("https://example.test/en");
    expect(u).toContain("https://example.test/sk/company/AMD");
  });
});
