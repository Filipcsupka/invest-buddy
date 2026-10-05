import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEvidence } from "../quotes.mjs";

const bundle = { documents: [{ url: "https://sec.gov/a", publishedAt: "2026-09-20T00:00:00.000Z", displayAllowed: true, fiscalPeriod: "Q2", excerpt: "Revenue was $46.7 billion,   up 56% from a year ago. Guidance raised." }] };
const base = () => ({ symbol: "NVDA", confidence: "high", fundamentals: { revenueAccelerating: true, epsBeat: true, productCatalyst: { present: true, kind: "chip", summary: "x" }, guidanceRaised: false }, evidence: [] });

test("keeps true claims whose quote is in the cited stored text (whitespace and case tolerant)", () => {
  const out = base(); out.evidence = [{ claim: "fundamentals.revenueAccelerating", url: "https://sec.gov/a", publishedAt: "2026-09-20", fiscalPeriod: "Q2 FY2027", quote: "revenue was $46.7 billion, up 56% from a year ago." }];
  const r = checkEvidence(out, bundle);
  assert.equal(r.output.fundamentals.revenueAccelerating, true);
  assert.equal(r.output.evidence.length, 1);
});
test("downgrades true to null when the url is not in the bundle", () => {
  const out = base(); out.evidence = [{ claim: "fundamentals.epsBeat", url: "https://invented.example/x", publishedAt: "2026-09-20", fiscalPeriod: "Q2", quote: "EPS beat" }];
  const r = checkEvidence(out, bundle);
  assert.equal(r.output.fundamentals.epsBeat, null);
  assert.equal(r.output.evidence.length, 0);
  assert.ok(r.dropped.some((d) => d.reason === "url not in bundle"));
});
test("downgrades true to null when the quote is not in the stored text", () => {
  const out = base(); out.evidence = [{ claim: "fundamentals.revenueAccelerating", url: "https://sec.gov/a", publishedAt: "2026-09-20", fiscalPeriod: "Q2 FY2027", quote: "Revenue doubled." }];
  assert.equal(checkEvidence(out, bundle).output.fundamentals.revenueAccelerating, null);
});
test("nulls productCatalyst present:true without verified evidence; leaves false values alone", () => {
  const r = checkEvidence(base(), bundle);
  assert.equal(r.output.fundamentals.productCatalyst, null);
  assert.equal(r.output.fundamentals.guidanceRaised, false);
});

const ev = (over = {}) => ({ claim: "fundamentals.revenueAccelerating", url: "https://sec.gov/a", publishedAt: "2026-09-20", fiscalPeriod: "Q2 FY2027", quote: "Guidance raised.", ...over });
const run = (item, b = bundle, opts) => { const out = base(); out.evidence = [item]; return checkEvidence(out, b, opts); };

test("drops a claim when the model's publishedAt differs from the document date", () => {
  const r = run(ev({ publishedAt: "2026-10-01" }));
  assert.equal(r.output.fundamentals.revenueAccelerating, null);
  assert.match(r.dropped[0].reason, /does not match document date 2026-09-20/);
});
test("drops a claim with no publishedAt", () => {
  const item = ev(); delete item.publishedAt;
  assert.equal(run(item).output.fundamentals.revenueAccelerating, null);
});
test("requires a non-empty fiscalPeriod", () => {
  for (const fiscalPeriod of ["", "   ", undefined]) {
    const r = run(ev({ fiscalPeriod }));
    assert.equal(r.output.fundamentals.revenueAccelerating, null);
    assert.equal(r.dropped[0].reason, "fiscalPeriod missing");
  }
});
test("drops evidence that cites a document that is not cleared for display, or has no flag", () => {
  for (const displayAllowed of [false, undefined]) {
    const b = { documents: [{ ...bundle.documents[0], displayAllowed }] };
    const r = run(ev(), b);
    assert.equal(r.output.fundamentals.revenueAccelerating, null);
    assert.equal(r.output.evidence.length, 0);
    assert.equal(r.dropped[0].reason, "document not cleared for display");
  }
});
test("keeps false values that cite nothing, even from a non-display bundle", () => {
  const b = { documents: [{ ...bundle.documents[0], displayAllowed: false }] };
  assert.equal(checkEvidence(base(), b).output.fundamentals.guidanceRaised, false);
});
test("enforces the per-field freshness window when asOf is given", () => {
  const catalyst = (asOf) => { const out = base(); out.fundamentals.productCatalyst = { present: true, kind: "chip", summary: "x" }; out.evidence = [ev({ claim: "fundamentals.productCatalyst" })]; return checkEvidence(out, bundle, { asOf }); };
  assert.equal(catalyst("2026-10-20").output.fundamentals.productCatalyst.present, true);
  assert.equal(catalyst("2026-10-21").output.fundamentals.productCatalyst, null);
  assert.equal(run(ev(), bundle, { asOf: "2026-12-29" }).output.fundamentals.revenueAccelerating, true);
  assert.equal(run(ev(), bundle, { asOf: "2026-12-30" }).output.fundamentals.revenueAccelerating, null);
  assert.equal(run(ev(), bundle, { asOf: "2026-09-19" }).output.fundamentals.revenueAccelerating, null);
});
