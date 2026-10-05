// Quote check for script-first extraction. The model only saw stored text, so every positive
// claim must cite a stored document and the quote must occur in that document's excerpt.
// Claims that fail are downgraded to null (unknown), never kept as true.
//
// An evidence item is kept only when all of these hold:
//   - its url is a bundle document and the document may be shown publicly (displayAllowed === true; missing means false)
//   - fiscalPeriod is not empty
//   - publishedAt equals the document's own date (the model cannot choose a date)
//   - the quote occurs in the excerpt after whitespace and case normalisation
//   - the document is inside the claim's freshness window, when an as-of date is given
const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

/** Same numbers as freshnessDays in src/data/evidence.ts; src/db/bundle.test.ts compares the two. */
export const FRESHNESS_DAYS = {
  revenueAccelerating: 100, revenueDeclining: 100, epsBeat: 100, guidanceRaised: 100, guidanceCut: 100,
  productCatalyst: 30, insiderOrInstitutionalBuying: 60, narrativeChanged: 30,
};

const day = (iso) => String(iso ?? "").slice(0, 10);

export function checkEvidence(output, bundle, { asOf = null } = {}) {
  const byUrl = new Map(bundle.documents.map((d) => [d.url, { text: norm(d.excerpt), publishedAt: day(d.publishedAt), displayAllowed: d.displayAllowed === true }]));
  const dropped = [];
  const good = new Set();
  const evidence = [];
  for (const item of output.evidence ?? []) {
    const doc = byUrl.get(item.url);
    const drop = (reason) => dropped.push({ claim: item.claim, reason });
    if (doc === undefined) { drop("url not in bundle"); continue; }
    if (!doc.displayAllowed) { drop("document not cleared for display"); continue; }
    if (!String(item.fiscalPeriod ?? "").trim()) { drop("fiscalPeriod missing"); continue; }
    if (item.publishedAt !== doc.publishedAt) { drop(`publishedAt ${item.publishedAt ?? "missing"} does not match document date ${doc.publishedAt}`); continue; }
    if (!norm(item.quote ?? "") || !doc.text.includes(norm(item.quote))) { drop("quote not found in stored text"); continue; }
    const window = FRESHNESS_DAYS[String(item.claim).split(".").at(-1)];
    if (asOf && window !== undefined) {
      const age = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${doc.publishedAt}T00:00:00Z`)) / 86_400_000;
      if (!Number.isFinite(age) || age < 0 || age > window) { drop(`document is ${age} days old, window is ${window}`); continue; }
    }
    evidence.push(item);
    good.add(item.claim);
  }
  const fundamentals = { ...output.fundamentals };
  for (const [field, value] of Object.entries(fundamentals)) {
    if (value === true && !good.has(`fundamentals.${field}`)) { fundamentals[field] = null; dropped.push({ claim: `fundamentals.${field}`, reason: "true without verified evidence; set to null" }); }
    if (field === "productCatalyst" && value && value.present === true && !good.has("fundamentals.productCatalyst")) { fundamentals.productCatalyst = null; dropped.push({ claim: "fundamentals.productCatalyst", reason: "present without verified evidence; set to null" }); }
  }
  return { output: { ...output, fundamentals, evidence }, dropped };
}
