import { describe, expect, it } from "vitest";
import { buildFieldSources, classifyRef, fieldSourcesFor, type StoredDocInfo } from "./sources";

const XBRL = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
const RELEASE = "https://www.sec.gov/Archives/edgar/data/1045810/ex99.htm";
const Q10 = "https://www.sec.gov/Archives/edgar/data/1045810/10q.htm";
const F4 = "https://www.sec.gov/Archives/edgar/data/1045810/form4.xml";
const AV = "https://www.alphavantage.co/query?function=EARNINGS&symbol=NVDA";
const docs = new Map<string, StoredDocInfo>([
  [RELEASE, { docType: "8-K EX-99.1", publishedAt: "2026-08-26", displayAllowed: true }],
  [Q10, { docType: "10-Q", publishedAt: "2026-08-28", displayAllowed: true }],
  [F4, { docType: "Form 4", publishedAt: "2026-09-20", displayAllowed: true }],
  [AV, { docType: "EPS surprise", publishedAt: "2026-08-26", displayAllowed: false }],
]);
const row = (field: string, agreement: string, urls: string[], verified = true) => ({ field, agreement, verified, evidence_refs: urls.map((url) => ({ url })) });

describe("source classification", () => {
  it("links the public SEC XBRL url and stored display-allowed documents, with their kind and date", () => {
    expect(classifyRef({ url: XBRL })).toEqual({ kind: "xbrl", href: XBRL, publishedAt: null });
    expect(classifyRef({ url: RELEASE }, docs.get(RELEASE))).toEqual({ kind: "release", href: RELEASE, publishedAt: "2026-08-26" });
    expect(classifyRef({ url: Q10, publishedAt: "2026-08-27" }, docs.get(Q10))).toEqual({ kind: "10-Q", href: Q10, publishedAt: "2026-08-27" });
    expect(classifyRef({ url: F4 }, docs.get(F4))).toMatchObject({ kind: "form4", href: F4 });
  });
  it("gives non-displayable third-party and unstored pages a label and never an href", () => {
    expect(classifyRef({ url: AV }, docs.get(AV))).toEqual({ kind: "alphavantage", href: null, publishedAt: "2026-08-26" });
    expect(classifyRef({ url: "https://fred.stlouisfed.org/series/DGS10" })).toMatchObject({ kind: "fred", href: null });
    expect(classifyRef({ url: "https://www.cboe.com/vix" })).toMatchObject({ kind: "vix", href: null });
    expect(classifyRef({ url: "https://example.com/news" })).toMatchObject({ kind: "unstored", href: null });
    expect(classifyRef({ url: RELEASE }, { docType: "8-K EX-99.1", publishedAt: "2026-08-26", displayAllowed: false })).toMatchObject({ kind: "unstored", href: null });
    expect(classifyRef({ url: AV }, { docType: "EPS surprise", publishedAt: null, displayAllowed: true })?.href).toBeNull();
  });
  it("never links a non-https url", () => {
    const http = "http://www.sec.gov/Archives/edgar/data/1/10q.htm";
    expect(classifyRef({ url: http }, { docType: "10-Q", publishedAt: "2026-08-28", displayAllowed: true })?.href).toBeNull();
    expect(classifyRef({ url: "http://data.sec.gov/api/xbrl/companyfacts/x.json" })?.href).toBeNull();
  });
});

describe("sources per agreement type", () => {
  const rows = [
    row("revenueAccelerating", "xbrl_override", [XBRL]),
    row("epsBeat", "data_rule", [AV]),
    row("guidanceRaised", "verified_single", [RELEASE]),
    row("revenueDeclining", "agree", [Q10, RELEASE]),
    row("productCatalyst", "single", [RELEASE], false),
    row("narrativeChanged", "disputed", [RELEASE], false),
    row("insiderOrInstitutionalBuying", "agree", [F4, F4]),
  ];
  const out = buildFieldSources(rows, docs);
  it("xbrl_override gives the XBRL link", () => expect(out.revenueAccelerating).toEqual([{ kind: "xbrl", href: XBRL, publishedAt: null }]));
  it("data_rule gives the third-party label without a link", () => expect(out.epsBeat).toEqual([{ kind: "alphavantage", href: null, publishedAt: "2026-08-26" }]));
  it("verified_single gives the stored release link", () => expect(out.guidanceRaised).toEqual([{ kind: "release", href: RELEASE, publishedAt: "2026-08-26" }]));
  it("agree gives every distinct displayable document, newest first", () => expect(out.revenueDeclining.map((s) => s.kind)).toEqual(["10-Q", "release"]));
  it("single and disputed (not verified) give nothing", () => { expect(out.productCatalyst).toBeUndefined(); expect(out.narrativeChanged).toBeUndefined(); });
  it("deduplicates repeated urls", () => expect(out.insiderOrInstitutionalBuying).toHaveLength(1));
});

describe("fieldSourcesFor", () => {
  it("uses one document query for all fields and none when there is no url", async () => {
    const calls: unknown[][] = [];
    const pool = { query: async (_sql: string, params: unknown[]) => { calls.push(params); return { rows: [{ url: RELEASE, doc_type: "8-K EX-99.1", published_at: "2026-08-26", display_allowed: "true" }, { url: AV, doc_type: "EPS surprise", published_at: "2026-08-26", display_allowed: null }] }; } };
    const out = await fieldSourcesFor(pool, [row("epsBeat", "data_rule", [AV]), row("guidanceRaised", "agree", [RELEASE]), row("revenueAccelerating", "xbrl_override", [XBRL])]);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual([AV, RELEASE]);
    expect(out.guidanceRaised[0].href).toBe(RELEASE);
    expect(out.epsBeat[0].href).toBeNull();
    calls.length = 0;
    await fieldSourcesFor(pool, [row("revenueAccelerating", "xbrl_override", [XBRL])]);
    expect(calls).toHaveLength(0);
  });
});

describe("EODHD source classification", () => {
  it("labels a derived vendor signal without exposing an unlicensed link", () => {
    const source = classifyRef({ url: "https://eodhd.com/api/v1.1/fundamentals/AAPL.US#2025-10-15", publishedAt: "2025-10-15" },
      { docType: "EPS surprise", publishedAt: "2025-10-15", displayAllowed: false });
    expect(source).toEqual({ kind: "eodhd", publishedAt: "2025-10-15", href: null });
  });
});
