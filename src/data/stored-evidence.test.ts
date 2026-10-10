import { describe, expect, it, vi } from "vitest";
import { pgDocumentLookup, storedFirstVerifier, storedOnlyVerifier, type StoredDocumentLookup } from "./stored-evidence";
import type { EvidenceRef } from "./evidence";

const entry = (over: Partial<EvidenceRef> = {}): EvidenceRef => ({ claim: "fundamentals.epsBeat", url: "https://www.sec.gov/ex99.htm", publishedAt: "2026-09-20", fiscalPeriod: "Q2 FY2027", quote: "Revenue was $46.7 billion, up 56%", ...over });
const stored = (body: string, publishedAt = "2026-09-20T00:00:00.000Z"): StoredDocumentLookup => async () => ({ body, publishedAt });
const live = () => vi.fn(async () => false);

describe("storedFirstVerifier", () => {
  it("verifies against the stored text and never fetches a stored url", async () => {
    const fallback = live();
    const verify = storedFirstVerifier(stored("<p>Revenue   was $46.7 billion,\n up 56% from a year ago</p>"), fallback);
    expect(await verify(entry(), "2026-10-05")).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });
  it("is case and whitespace tolerant like the live verifier and decodes &amp;", async () => {
    const verify = storedFirstVerifier(stored("R&amp;D   spend ROSE"), live());
    expect(await verify(entry({ quote: "r&d spend rose" }), "2026-10-05")).toBe(true);
  });
  it("rejects a quote that is not in the stored text, without a live retry", async () => {
    const fallback = live();
    expect(await storedFirstVerifier(stored("something else"), fallback)(entry(), "2026-10-05")).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });
  it("rejects a publishedAt that differs from the stored document date", async () => {
    expect(await storedFirstVerifier(stored("Revenue was $46.7 billion, up 56%", "2026-09-01T00:00:00.000Z"), live())(entry(), "2026-10-05")).toBe(false);
  });
  it("applies the field's freshness window and the missing-field checks", async () => {
    const verify = storedFirstVerifier(stored("Revenue was $46.7 billion, up 56%"), live());
    expect(await verify(entry({ claim: "fundamentals.productCatalyst" }), "2026-12-19")).toBe(true);
    expect(await verify(entry({ claim: "fundamentals.productCatalyst" }), "2026-12-21")).toBe(false);
    expect(await verify(entry(), "2026-09-19")).toBe(false);
    expect(await verify(entry({ fiscalPeriod: "" }), "2026-10-05")).toBe(false);
    expect(await verify(entry({ quote: undefined }), "2026-10-05")).toBe(false);
    expect(await verify(entry({ url: "http://www.sec.gov/ex99.htm" }), "2026-10-05")).toBe(false);
  });
  it("falls back to the live verifier only for a url that is not stored", async () => {
    const fallback = vi.fn(async () => true);
    expect(await storedFirstVerifier(async () => null, fallback)(entry(), "2026-10-05")).toBe(true);
    expect(fallback).toHaveBeenCalledWith(entry(), "2026-10-05");
  });
  it("rejects when the lookup throws", async () => {
    const fallback = live();
    expect(await storedFirstVerifier(async () => { throw new Error("db down"); }, fallback)(entry(), "2026-10-05")).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("pgDocumentLookup", () => {
  it("reads each url once and maps the row", async () => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({ rows: params[0] === "https://a" ? [{ body: "text", published_at: new Date("2026-09-20T00:00:00Z") }] : [] }));
    const lookup = pgDocumentLookup({ query });
    expect(await lookup("https://a")).toEqual({ body: "text", publishedAt: "2026-09-20T00:00:00.000Z", displayAllowed: false });
    expect(await lookup("https://a")).toEqual({ body: "text", publishedAt: "2026-09-20T00:00:00.000Z", displayAllowed: false });
    expect(await lookup("https://b")).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("reads display_allowed from the stored meta, and treats legacy edgar rows as allowed", async () => {
    const rows: Record<string, unknown> = {
      "https://x": { body: "t", published_at: "2026-09-20T00:00:00Z", source: "sec-frames", meta: { display_allowed: true } },
      "https://y": { body: "t", published_at: "2026-09-20T00:00:00Z", source: "edgar", meta: {} },
      "https://z": { body: "t", published_at: "2026-09-20T00:00:00Z", source: "alphavantage", meta: { display_allowed: false } },
    };
    const lookup = pgDocumentLookup({ query: async (_sql, params) => ({ rows: [rows[params[0] as string]] as never }) });
    expect(await lookup("https://x")).toMatchObject({ displayAllowed: true });
    expect(await lookup("https://y")).toMatchObject({ displayAllowed: true });
    expect(await lookup("https://z")).toMatchObject({ displayAllowed: false });
  });
});

describe("storedOnlyVerifier", () => {
  const doc = (displayAllowed: boolean | undefined): StoredDocumentLookup => async () => ({ body: "Revenue was $46.7 billion, up 56%", publishedAt: "2026-09-20T00:00:00.000Z", displayAllowed });
  it("accepts a verbatim quote from a stored, display-allowed document", async () => {
    expect(await storedOnlyVerifier(doc(true))(entry(), "2026-10-05")).toBe(true);
  });
  it("rejects a document that is not display-allowed, a url that is not stored, and a quote that is not in the text", async () => {
    expect(await storedOnlyVerifier(doc(false))(entry(), "2026-10-05")).toBe(false);
    expect(await storedOnlyVerifier(doc(undefined))(entry(), "2026-10-05")).toBe(false);
    expect(await storedOnlyVerifier(async () => null)(entry(), "2026-10-05")).toBe(false);
    expect(await storedOnlyVerifier(async () => { throw new Error("db down"); })(entry(), "2026-10-05")).toBe(false);
    expect(await storedOnlyVerifier(doc(true))(entry({ quote: "Revenue was $50 billion" }), "2026-10-05")).toBe(false);
  });
  it("keeps the freshness window and the date match", async () => {
    expect(await storedOnlyVerifier(doc(true))(entry(), "2026-12-30")).toBe(false);
    expect(await storedOnlyVerifier(doc(true))(entry({ publishedAt: "2026-09-21" }), "2026-10-05")).toBe(false);
  });
});
