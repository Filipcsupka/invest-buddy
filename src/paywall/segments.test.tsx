import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PaywallSegment } from "@/components/paywall-segment";
import type { Viewer } from "@/viewer/viewer";
import { PAYWALL_SEGMENTS } from "./segments";

const admin: Viewer = { tier: "admin", preview: false };
const paid: Viewer = { tier: "paid", preview: false };
const free: Viewer = { tier: "free", preview: false };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

// Registry ids whose page markers land with the other tier work packages (company and record, screens).
const pendingMarkers = new Set(["idea-card", "track-record-periods"]);

it("keeps every page marker in the registry and every active registry entry on a page", () => {
  const used = new Set<string>();
  for (const file of sourceFiles(resolve(process.cwd(), "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<PaywallSegment\s+(?:[^>]*?\s)?id="([^"]+)"/g)) used.add(match[1]);
  }
  expect([...used].filter((id) => !(id in PAYWALL_SEGMENTS))).toEqual([]);
  expect(Object.keys(PAYWALL_SEGMENTS).filter((id) => !pendingMarkers.has(id) && !used.has(id))).toEqual([]);
  expect(used.has("owner-cash") || used.has("owner-suggestions")).toBe(false);
});

it("adds only a marker for an admin on a free segment", () => {
  const content = <section><h2>Position weights</h2><p>20 %</p></section>;
  const plain = renderToStaticMarkup(content);
  const wrapped = renderToStaticMarkup(<PaywallSegment id="portfolio-weights" viewer={admin}>{content}</PaywallSegment>);
  expect(wrapped).toBe(plain.replace("<section", '<section data-paywall-candidate="portfolio-weights"'));
});

it("shows an admin the children and a Paid badge on paid segments", () => {
  const content = <section><h2>History</h2></section>;
  for (const id of ["score-history", "idea-card"] as const) {
    const out = renderToStaticMarkup(<PaywallSegment id={id} viewer={admin}>{content}</PaywallSegment>);
    expect(out).toMatch(new RegExp(`^<span class="[^"]*" data-tier-badge="${id}" title="[^"]+">Paid</span><section data-paywall-candidate="${id}" data-segment-tier="paid"><h2>History</h2></section>$`));
  }
  expect(renderToStaticMarkup(<PaywallSegment id="idea-card" viewer={admin} locale="sk">{content}</PaywallSegment>)).toContain(">Platené<");
});

it("leaves paid viewers with the plain marker", () => {
  const content = <section><h2>History</h2></section>;
  expect(renderToStaticMarkup(<PaywallSegment id="score-history" viewer={paid}>{content}</PaywallSegment>))
    .toBe('<section data-paywall-candidate="score-history"><h2>History</h2></section>');
});

it("replaces a locked segment with a lock card for a free viewer, without the child text", () => {
  const out = renderToStaticMarkup(<PaywallSegment id="scanner-streak" viewer={free} detail="12 signals"><section><h2>Secret heading</h2><p>Secret row</p></section></PaywallSegment>);
  expect(out).not.toContain("Secret");
  expect(out).toContain('data-tier-lock="scanner-streak"');
  expect(out).toContain("12 signals");
  expect(out).toContain("The status, score and rules stay open to everyone.");
  expect(renderToStaticMarkup(<PaywallSegment id="scanner-streak" viewer={free} locale="sk"><p>x</p></PaywallSegment>)).toContain("V platenej úrovni");
});

it("keeps the children of a depth-limited segment and adds a note for a free viewer", () => {
  const out = renderToStaticMarkup(<PaywallSegment id="score-history" viewer={free}><div>Rows</div></PaywallSegment>);
  expect(out).toContain('<div data-paywall-candidate="score-history">Rows</div>');
  expect(out).toContain("data-tier-note=\"score-history\"");
  expect(out).toContain("90 days");
  expect(out).not.toContain("data-tier-badge");
});

it("wraps text children in one marked element", () => {
  expect(renderToStaticMarkup(<PaywallSegment id="portfolio-weights" viewer={free}>text</PaywallSegment>)).toBe('<div data-paywall-candidate="portfolio-weights">text</div>');
});

it("treats a free segment as open for every tier", () => {
  for (const viewer of [admin, paid, free]) {
    expect(renderToStaticMarkup(<PaywallSegment id="sizing-matrix" viewer={viewer}><p>Content</p></PaywallSegment>)).toBe('<p data-paywall-candidate="sizing-matrix">Content</p>');
  }
});

it("keeps the section structure used by portfolio and sizing selectors", () => {
  for (const id of ["portfolio-performance", "sizing-matrix"] as const) {
    const out = renderToStaticMarkup(<main><PaywallSegment id={id}><section className="sheet-section"><p>Content</p></section></PaywallSegment><section>Next</section></main>);
    expect(out).toMatch(/^<main><section class="sheet-section" data-paywall-candidate="[^"]+"><p>Content<\/p><\/section><section>Next<\/section><\/main>$/);
  }
});
