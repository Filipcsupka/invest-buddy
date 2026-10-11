import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalystFromDocuments, catalystFromFact, plainText, type CatalystDoc } from "./catalyst";
import { normalize } from "./evidence";
import { classifyRef } from "./sources";
import { deriveFacts } from "../jobs/collect";
import { MemoryCollectorRepository } from "../db/collectors";
import { reconcileField, type AgentFinding } from "../jobs/reconcile";
import { LICENSES, sourceDocument } from "../collectors/sources/common";

const asOf = "2026-10-10";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const doc = (over: Partial<CatalystDoc>): CatalystDoc => ({ url: "https://www.sec.gov/Archives/edgar/data/1/000000000026000001/a.htm", docType: "8-K", publishedAt: "2026-09-12T00:00:00Z", items: "7.01,9.01", body: fixture("catalyst-8k-qualifying.html"), displayAllowed: true, ...over });

describe("catalystFromDocuments", () => {
  it("qualifying 8-K: item, filing and a quote found in the stored text", () => {
    const result = catalystFromDocuments([doc({})], asOf)!;
    expect(result).toMatchObject({ present: true, item: "7.01", publishedAt: "2026-09-12", checked: 1 });
    expect(normalize(plainText(doc({}).body))).toContain(normalize(result.quote!));
    expect(result.quote).toMatch(/launch of its new AI inference platform/);
  });
  it("boilerplate 8-K: read, nothing qualifies", () => {
    expect(catalystFromDocuments([doc({ body: fixture("catalyst-8k-boilerplate.html") })], asOf)).toEqual({ present: false, checked: 1 });
  });
  it("item 5.02 and a credit agreement do not qualify, even with the word partner nearby", () => {
    const other = doc({ items: "5.02", body: "<p>Item 5.02 Departure of Directors. The board appointed a new director.</p>" });
    const loan = doc({ items: "1.01", body: "<p>Item 1.01 Entry into a Material Definitive Agreement. The Company entered into a credit agreement with its lenders.</p>" });
    expect(catalystFromDocuments([other, loan], asOf)).toEqual({ present: false, checked: 2 });
  });
  it("item 1.01 supply agreement qualifies", () => {
    const supply = doc({ items: "1.01", body: "<p>Item 1.01 Entry into a Material Definitive Agreement. The Company entered into a supply agreement with a major automaker.</p>" });
    expect(catalystFromDocuments([supply], asOf)).toMatchObject({ present: true, item: "1.01" });
  });
  it("item 2.02 needs product wording; an exhibit carries the filing's item", () => {
    const plain = doc({ docType: "8-K EX-99.1", items: "2.02,9.01", body: "<p>Revenue rose 20% year over year. Net income was $5 million.</p>" });
    const product = doc({ docType: "8-K EX-99.1", items: "2.02,9.01", body: "<p>Revenue rose 20%. During the quarter we launched the X200 accelerator.</p>" });
    expect(catalystFromDocuments([plain], asOf)).toEqual({ present: false, checked: 1 });
    expect(catalystFromDocuments([product], asOf)).toMatchObject({ present: true, item: "2.02", docType: "8-K EX-99.1" });
  });
  it("no text: null. Old filing, hidden source and other forms do not count as read", () => {
    expect(catalystFromDocuments([], asOf)).toBeNull();
    expect(catalystFromDocuments([doc({ publishedAt: "2026-07-01T00:00:00Z" }), doc({ displayAllowed: false }), doc({ docType: "10-Q" }), doc({ body: "  " })], asOf)).toBeNull();
  });
  it("window edge: 90 days counts, 91 does not", () => {
    expect(catalystFromDocuments([doc({ publishedAt: "2026-07-12T00:00:00Z" })], asOf)).toMatchObject({ present: true });
    expect(catalystFromDocuments([doc({ publishedAt: "2026-07-11T00:00:00Z" })], asOf)).toBeNull();
  });
});

describe("catalystFromFact", () => {
  const hit = { present: true, checked: 2, item: "7.01", url: "https://www.sec.gov/x.htm", publishedAt: "2026-09-12", quote: "announcing the launch of its new platform" };
  it("true result cites the filing with the label SEC 8-K item X", () => {
    const result = catalystFromFact({ asOf: "2026-09-12", value: hit }, asOf)!;
    expect(result.value).toBe(true);
    expect(result.refs[0]).toMatchObject({ claim: "fundamentals.productCatalyst", fiscalPeriod: "SEC 8-K item 7.01", publishedAt: "2026-09-12", quote: hit.quote });
  });
  it("false result has no refs; stale or future facts are ignored", () => {
    expect(catalystFromFact({ asOf: "2026-10-09", value: { present: false, checked: 3 } }, asOf)).toMatchObject({ value: false, refs: [] });
    expect(catalystFromFact({ asOf: "2026-06-01", value: { present: false, checked: 3 } }, asOf)).toBeNull();
    expect(catalystFromFact({ asOf: "2026-07-01", value: { ...hit, publishedAt: "2026-07-01" } }, asOf)).toBeNull();
    expect(catalystFromFact({ asOf: "2026-10-12", value: hit }, "2026-09-01")).toBeNull();
    expect(catalystFromFact(null, asOf)).toBeNull();
  });
  it("the source item gets the SEC 8-K item label only for a displayable filing", () => {
    const ref = { url: hit.url, publishedAt: hit.publishedAt, fiscalPeriod: "SEC 8-K item 7.01" };
    expect(classifyRef(ref, { docType: "8-K", publishedAt: "2026-09-12", displayAllowed: true })).toMatchObject({ kind: "8-K", item: "7.01", href: hit.url });
    expect(classifyRef(ref, { docType: "8-K", publishedAt: "2026-09-12", displayAllowed: false })?.item).toBeUndefined();
  });
});

describe("collect fact and reconcile", () => {
  const edgar = (over: Partial<CatalystDoc> & { docType?: string } = {}) => sourceDocument({ source: "edgar", symbol: "EXMP", docType: over.docType ?? "8-K", url: over.url ?? doc({}).url, publishedAt: over.publishedAt ?? "2026-09-12T00:00:00Z", body: over.body ?? fixture("catalyst-8k-qualifying.html"), meta: { accession: "0000000000-26-000001", items: over.items ?? "7.01,9.01" } }, LICENSES.sec);
  it("writes catalyst_8k true with the filing as the document, dated by the filing", async () => {
    const d = edgar();
    const facts = await deriveFacts("EXMP", [d], new Map([[d.url, 7]]), new MemoryCollectorRepository(), asOf);
    const fact = facts.find((f) => f.key === "catalyst_8k")!;
    expect(fact).toMatchObject({ asOf: "2026-09-12", documentIds: [7], sourceId: "sec", value: { present: true, item: "7.01" } });
    expect(fact.expiresAt).toBe("2026-12-11T00:00:00.000Z");
  });
  it("writes none-found for boilerplate and no fact without 8-K text", async () => {
    const d = edgar({ body: fixture("catalyst-8k-boilerplate.html") });
    const none = (await deriveFacts("EXMP", [d], new Map([[d.url, 7]]), new MemoryCollectorRepository(), asOf)).find((f) => f.key === "catalyst_8k");
    expect(none).toMatchObject({ asOf, value: { present: false, checked: 1 } });
    expect((await deriveFacts("EXMP", [], new Map(), new MemoryCollectorRepository(), asOf)).some((f) => f.key === "catalyst_8k")).toBe(false);
  });
  const finding = (name: "claude" | "codex", value: boolean): AgentFinding => ({ runId: `${name}-1`, runner: { name }, fundamentals: { productCatalyst: value }, evidence: { items: [{ claim: "fundamentals.productCatalyst", url: "https://example.com/a", publishedAt: "2026-09-20", fiscalPeriod: "Q3", quote: "The company launched a chip." }] }, confidence: "high" });
  const rule = catalystFromFact({ asOf: "2026-09-12", value: { present: true, checked: 1, item: "7.01", url: "https://www.sec.gov/x.htm", publishedAt: "2026-09-12", quote: "announcing the launch" } }, asOf)!;
  it("fills the unknown rule from the 8-K as a verified data rule", async () => {
    const result = await reconcileField("EXMP", "productCatalyst", asOf, [], async () => false, null, null, { catalyst: rule });
    expect(result).toMatchObject({ value: true, agreement: "data_rule", verified: true });
    expect(result.evidenceRefs[0].fiscalPeriod).toBe("SEC 8-K item 7.01");
    const none = await reconcileField("EXMP", "productCatalyst", asOf, [], async () => false, null, null, { catalyst: { value: false, reason: "read", refs: [] } });
    expect(none).toMatchObject({ value: false, agreement: "data_rule", verified: true, evidenceRefs: [] });
  });
  it("a verified extractor result still wins; a disputed one does not", async () => {
    const verified = await reconcileField("EXMP", "productCatalyst", asOf, [finding("claude", false), finding("codex", false)], async () => true, null, null, { catalyst: rule });
    expect(verified).toMatchObject({ value: false, agreement: "agree" });
    const single = await reconcileField("EXMP", "productCatalyst", asOf, [finding("claude", false)], async () => false, null, null, { catalyst: rule, storedVerify: async () => true });
    expect(single).toMatchObject({ value: false, agreement: "verified_single" });
    const disputed = await reconcileField("EXMP", "productCatalyst", asOf, [finding("claude", true), finding("codex", false)], async () => true, null, null, { catalyst: rule });
    expect(disputed).toMatchObject({ value: true, agreement: "data_rule" });
  });
  it("without a result the field stays unknown", async () => {
    expect(await reconcileField("EXMP", "productCatalyst", asOf, [], async () => false, null, null, { catalyst: null })).toMatchObject({ value: null, verified: false });
  });
});
