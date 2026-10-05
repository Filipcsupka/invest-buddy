import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type pg from "pg";
import { buildBundle, displayAllowedFor, focusExcerpt, selectExcerpts, windowDaysFor, withinWindow, type RawDocument } from "./bundle";
import { freshnessDays } from "../data/evidence";

const doc = (id: number, docType: string, publishedAt: string, body = "x".repeat(10000)): RawDocument => ({ id, url: `https://example.com/${id}`, source: "edgar", docType, publishedAt, body });

describe("selectExcerpts", () => {
  it("puts earnings exhibits first, then filings, then newest", () => {
    const out = selectExcerpts([doc(1, "press release", "2026-10-01T00:00:00Z"), doc(2, "4", "2026-10-02T00:00:00Z"), doc(3, "8-K EX-99.1", "2026-08-01T00:00:00Z"), doc(4, "10-Q", "2026-08-02T00:00:00Z")]);
    expect(out.map((d) => d.id)).toEqual([3, 4, 2, 1]);
  });
  it("caps each excerpt and the total", () => {
    const out = selectExcerpts([doc(1, "10-Q", "2026-08-01T00:00:00Z"), doc(2, "10-K", "2026-07-01T00:00:00Z"), doc(3, "8-K", "2026-06-01T00:00:00Z")], { perDocument: 6000, total: 9000, maxDocuments: 10 });
    expect(out.map((d) => d.excerpt.length)).toEqual([6000, 3000]);
  });
  it("limits the document count", () => {
    const docs = Array.from({ length: 30 }, (_, i) => doc(i + 1, "press release", `2026-09-${String(i % 28 + 1).padStart(2, "0")}T00:00:00Z`, "short"));
    expect(selectExcerpts(docs, { perDocument: 100, total: 100000, maxDocuments: 5 })).toHaveLength(5);
  });
});

describe("selectExcerpts determinism and display flag", () => {
  it("breaks timestamp ties by id", () => {
    const out = selectExcerpts([doc(7, "press release", "2026-10-01T00:00:00Z", "a"), doc(3, "press release", "2026-10-01T00:00:00Z", "a"), doc(5, "press release", "2026-10-01T00:00:00Z", "a")]);
    expect(out.map((d) => d.id)).toEqual([3, 5, 7]);
  });
  it("carries displayAllowed and treats a missing flag as false", () => {
    const out = selectExcerpts([{ ...doc(1, "10-Q", "2026-08-01T00:00:00Z", "a"), displayAllowed: true }, doc(2, "10-K", "2026-08-01T00:00:00Z", "a")]);
    expect(out.map((d) => d.displayAllowed)).toEqual([true, false]);
  });
});

describe("displayAllowedFor", () => {
  it("lets an explicit flag win, then falls back to the source", () => {
    expect(displayAllowedFor("clinicaltrials", { display_allowed: false })).toBe(false);
    expect(displayAllowedFor("sec", { display_allowed: true })).toBe(true);
    expect(displayAllowedFor("edgar", { display_allowed: false })).toBe(false);
    expect(displayAllowedFor("edgar", {})).toBe(true);
    expect(displayAllowedFor("rss", {})).toBe(false);
    expect(displayAllowedFor("gnews", null)).toBe(false);
    expect(displayAllowedFor("edgar", { display_allowed: "yes" })).toBe(true);
  });
});

describe("freshness windows", () => {
  it("uses the reconcile windows per document type", () => {
    expect(windowDaysFor("8-K EX-99.1")).toBe(freshnessDays.revenueAccelerating);
    expect(windowDaysFor("10-Q")).toBe(100);
    expect(windowDaysFor("4")).toBe(freshnessDays.insiderOrInstitutionalBuying);
    expect(windowDaysFor("press release")).toBe(30);
  });
  it("drops documents after the as-of day and older than the window", () => {
    expect(withinWindow({ docType: "press release", publishedAt: "2026-10-05T15:00:00.000Z" }, "2026-10-05")).toBe(true);
    expect(withinWindow({ docType: "press release", publishedAt: "2026-10-06T00:00:00.000Z" }, "2026-10-05")).toBe(false);
    expect(withinWindow({ docType: "press release", publishedAt: "2026-09-05T00:00:00.000Z" }, "2026-10-05")).toBe(true);
    expect(withinWindow({ docType: "press release", publishedAt: "2026-09-04T00:00:00.000Z" }, "2026-10-05")).toBe(false);
    expect(withinWindow({ docType: "4", publishedAt: "2026-08-06T00:00:00.000Z" }, "2026-10-05")).toBe(true);
    expect(withinWindow({ docType: "4", publishedAt: "2026-08-05T00:00:00.000Z" }, "2026-10-05")).toBe(false);
    expect(withinWindow({ docType: "10-Q", publishedAt: "2026-06-27T00:00:00.000Z" }, "2026-10-05")).toBe(true);
    expect(withinWindow({ docType: "10-Q", publishedAt: "2026-06-26T00:00:00.000Z" }, "2026-10-05")).toBe(false);
  });
});

describe("buildBundle", () => {
  const row = (id: string, docType: string, published: string, source = "edgar", meta: unknown = {}) => ({ id, url: `https://example.com/${id}`, source, doc_type: docType, published_at: new Date(published), meta, body: `body ${id}` });
  const fakePool = (docs: unknown[], facts: unknown[] = []) => {
    const calls: { sql: string; params: unknown[] }[] = [];
    return { calls, pool: { query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: sql.includes("source_documents") ? docs : facts }; } } as unknown as pg.Pool };
  };
  it("orders by published_at then id, bounds by as-of and applies display and window rules", async () => {
    const { calls, pool } = fakePool([
      row("1", "10-Q", "2026-09-30T00:00:00Z"),
      row("2", "press release", "2026-07-01T00:00:00Z", "rss"),
      row("3", "clinical trial", "2026-10-01T00:00:00Z", "clinicaltrials", { display_allowed: false }),
    ], [{ fact_key: "insider_net_buy_90d", as_of: "2026-10-04", value: 1, document_ids: ["1"] }]);
    const bundle = await buildBundle(pool, "NVDA", 100, new Date("2026-10-05T12:00:00Z"), undefined, "2026-10-05");
    expect(calls[0].sql).toContain("ORDER BY published_at DESC, id");
    expect(calls[0].sql).toContain("published_at < ($3::date + 1)");
    expect(calls[0].params).toEqual(["NVDA", "2026-06-27", "2026-10-05"]);
    expect(calls[1].sql).toContain("as_of <= $2::date");
    expect(bundle.documents.map((d) => [d.id, d.displayAllowed])).toEqual([[1, true], [3, false]]);
    expect(bundle.facts).toEqual([{ key: "insider_net_buy_90d", asOf: "2026-10-04", value: 1, documentIds: [1] }]);
  });
});

describe("scanner quote check windows", () => {
  it("match freshnessDays in evidence.ts", async () => {
    const path = "../../scanner/quotes.mjs";
    const { FRESHNESS_DAYS } = (await import(/* @vite-ignore */ path)) as { FRESHNESS_DAYS: Record<string, number> };
    for (const [field, days] of Object.entries(FRESHNESS_DAYS)) expect(freshnessDays[field], field).toBe(days);
    expect(Object.keys(FRESHNESS_DAYS).sort()).toEqual(Object.keys(freshnessDays).filter((f) => !["sectorRotationIntoGrowth", "dataTailwind"].includes(f)).sort());
  });
});

describe("focusExcerpt", () => {
  const filler = "Cover page text. ".repeat(600);
  const body = `${filler}Total revenue was $46.7 billion, up 56% from a year ago. ${filler}The company raised its outlook for the next quarter. ${filler}`;
  it("returns short bodies unchanged", () => { expect(focusExcerpt("abc", 100)).toBe("abc"); });
  it("keeps the numbers that sit deep in a long filing, within the room", () => {
    const out = focusExcerpt(body, 6000);
    expect(out.length).toBeLessThanOrEqual(6000);
    expect(out).toContain("Total revenue was $46.7 billion, up 56% from a year ago.");
    expect(out).toContain("raised its outlook");
  });
  it("only contains text from the body, so quotes still verify", () => {
    for (const piece of focusExcerpt(body, 6000).split("\n[...]\n")) expect(body.includes(piece)).toBe(true);
  });
  it("falls back to the head when no keyword matches", () => { expect(focusExcerpt("x".repeat(10000), 6000)).toHaveLength(6000); });
  it("finds a revenue table beyond the cover text despite repeated policy mentions", async () => {
    const body = await readFile("src/collectors/fixtures/nvda_10q_deep.txt", "utf8");
    const [excerpt] = selectExcerpts([doc(9, "10-Q", "2026-09-01T00:00:00Z", body)]);
    expect(body.indexOf("Total revenue | ")).toBeGreaterThan(6000);
    expect(excerpt.excerpt).toContain("Total revenue | $46.7 billion | $30.0 billion | year-over-year growth 56%.");
    expect(excerpt.excerpt).toContain("Remaining performance obligations (RPO)");
    expect(selectExcerpts([doc(9, "10-Q", "2026-09-01T00:00:00Z", body)])[0].excerpt).toBe(excerpt.excerpt);
    for (const piece of excerpt.excerpt.split("\n[...]\n")) expect(body.includes(piece)).toBe(true);
  });
});
