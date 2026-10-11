import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkContrast, contrast, pairs, tokens } from "./check-contrast";

const css = readFileSync("src/app/globals.css", "utf8");

describe("contrast tokens", () => {
  it("passes WCAG AA for every checked pair in both themes", () => {
    expect(checkContrast(css)).toEqual([]);
  });
  it("checks every token it names", () => {
    const t = tokens(css);
    for (const [fg, bg] of pairs) {
      expect(t.has(fg), fg).toBe(true);
      expect(t.has(bg), bg).toBe(true);
    }
  });
  it("matches the WCAG reference ratios and reports a failing pair", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    const weak = css.replace(/--ink-3:\s*light-dark\(#[0-9a-f]{6}/i, "--ink-3: light-dark(#aaaaaa");
    expect(checkContrast(weak).some((line) => line.includes("ink-3"))).toBe(true);
  });
});
