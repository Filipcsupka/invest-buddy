import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PaywallSegment } from "@/components/paywall-segment";
import { PAYWALL_SEGMENTS } from "./segments";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

it("keeps every page marker in the registry and every active registry entry on a page", () => {
  const used = new Set<string>();
  for (const file of sourceFiles(resolve(process.cwd(), "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<PaywallSegment\s+id="([^"]+)"/g)) used.add(match[1]);
  }
  expect([...used].filter((id) => !(id in PAYWALL_SEGMENTS))).toEqual([]);
  // The existing idea card marker is reserved for the company page, owned by the other writer.
  expect(Object.keys(PAYWALL_SEGMENTS).filter((id) => id !== "idea-card" && !used.has(id))).toEqual([]);
});

it("adds only a transparent marker around content", () => {
  const content = <section><h2>Position weights</h2><p>20 %</p></section>;
  const plain = renderToStaticMarkup(content);
  const wrapped = renderToStaticMarkup(<PaywallSegment id="portfolio-weights">{content}</PaywallSegment>);
  expect(wrapped).toContain('data-paywall-candidate="portfolio-weights"');
  expect(wrapped).toBe(plain.replace("<section", '<section data-paywall-candidate="portfolio-weights"'));
});

it("keeps the section structure used by portfolio, allocation, and sizing selectors", () => {
  for (const id of ["portfolio-performance", "owner-cash", "sizing-matrix"] as const) {
    const out = renderToStaticMarkup(<main><PaywallSegment id={id}><section className="sheet-section"><p>Content</p></section></PaywallSegment><section>Next</section></main>);
    expect(out).toMatch(/^<main><section class="sheet-section" data-paywall-candidate="[^"]+"><p>Content<\/p><\/section><section>Next<\/section><\/main>$/);
  }
});
