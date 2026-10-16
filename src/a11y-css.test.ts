import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const modules = ["src/components/status-slider.module.css", "src/components/idea-card.module.css", "src/components/kit/kit.css", "src/app/[locale]/design/design.module.css"].map((path) => readFileSync(path, "utf8"));
const kit = modules[2];

/** Every declaration block for a selector, including ones inside media queries. */
function blocks(source: string, selector: string): string[] {
  const out: string[] = [];
  for (const m of source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1].split(",").some((part) => part.trim() === selector)) out.push(m[2]);
  return out;
}
const rem = (body: string, property: string) => Number(body.match(new RegExp(`(?:^|[\\s;])${property}:\\s*([\\d.]+)rem`))?.[1] ?? NaN);

describe("tap targets (44px = 2.75rem)", () => {
  it.each([
    ["min-height", [".nav-links a", ".lang-switch", ".icon-button", ".footer-links a", ".segment", ".sort"]],
  ] as const)("%s", (property, selectors) => {
    for (const selector of selectors) {
      const found = blocks(css, selector).map((body) => rem(body, property)).filter((n) => !Number.isNaN(n));
      expect(found.length, selector).toBeGreaterThan(0);
      for (const value of found) expect(value, selector).toBeGreaterThanOrEqual(2.75);
    }
  });
  it("sizes the icon button and the search field to 44px", () => {
    expect(blocks(css, ".icon-button").some((body) => rem(body, "width") >= 2.75)).toBe(true);
    expect(blocks(css, ".search-field input").some((body) => rem(body, "height") >= 2.75)).toBe(true);
    expect(blocks(css, ".button").some((body) => rem(body, "min-height") >= 2.75)).toBe(true);
  });
  it("keeps the kit's own controls at 44px", () => {
    for (const selector of [".kit-strip-toggle", ".kit-strip-link", ".kit-lock-action"]) expect(blocks(kit, selector).some((body) => rem(body, "min-height") >= 2.75), selector).toBe(true);
  });
  it("extends the ticker link hit area", () => {
    expect(blocks(css, ".ticker::after").join("")).toMatch(/inset:\s*-0\.75rem/);
  });
});

describe("focus, motion and scrolling", () => {
  it("shows a visible focus ring and never removes outlines without a replacement", () => {
    expect(blocks(css, ":focus-visible").join("")).toMatch(/outline:\s*2px solid var\(--signal\)/);
    for (const source of [css, ...modules]) for (const body of source.match(/[^{}]*\{[^{}]*outline:\s*(?:none|0)[^{}]*\}/g) ?? []) expect(body, "outline removed").toMatch(/^\s*main\b|border-color/);
  });
  it("has a skip link that appears on focus", () => {
    expect(blocks(css, ".skip-link").join("")).toMatch(/top:\s*-4rem/);
    expect(blocks(css, ".skip-link:focus").join("")).toMatch(/top:\s*var\(--s2\)/);
  });
  it("turns off animation and smooth scrolling for reduced motion", () => {
    const media = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(media).toMatch(/animation:\s*none !important/);
    expect(media).toMatch(/transition:\s*none !important/);
    expect(media).toMatch(/scroll-behavior:\s*auto !important/);
  });
  it("scrolls wide tables inside their own box", () => {
    expect(blocks(css, ".table-scroll").join("")).toMatch(/overflow-x:\s*auto/);
  });
  it("keeps the dark theme token set for the status colours", () => {
    expect(css).toMatch(/--st-wait:\s*light-dark\(/);
    expect(css).toMatch(/color-scheme:\s*light dark/);
  });
});
