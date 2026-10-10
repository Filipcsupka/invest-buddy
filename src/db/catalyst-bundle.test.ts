import { expect, it } from "vitest";
import type pg from "pg";
import { buildBundle, withinWindow } from "./bundle";
import { offVerifier } from "../data/evidence";

const asOf = "2026-10-10";
const row = (id: number, docType: string, date: string, source = "edgar", meta: unknown = {}) => ({
  id: String(id), url: `https://example.com/${id}`, source, doc_type: docType,
  published_at: new Date(`${date}T00:00:00Z`), meta, body: `Stored catalyst text ${id}`,
});

it("includes recent Item 7.01 filings, exhibits and symbol-matched news with their date and URL", async () => {
  const docs = [
    row(1, "8-K", "2026-08-01", "edgar", { items: "7.01" }),
    row(2, "8-K EX-99.1", "2026-08-01"),
    row(3, "press release", "2026-09-01", "rss", { symbols: ["NVDA"], display_allowed: false }),
    row(4, "news headline", "2026-09-02", "gdelt", { symbols: ["NVDA"], display_allowed: false }),
    row(5, "news headline", "2026-07-01", "gdelt", { symbols: ["NVDA"] }),
  ];
  let sql = "";
  const pool = { query: async (query: string) => { if (query.includes("source_documents")) { sql = query; return { rows: docs }; } return { rows: [] }; } } as unknown as pg.Pool;
  const bundle = await buildBundle(pool, "NVDA", 100, new Date(`${asOf}T12:00:00Z`), undefined, asOf);
  expect(sql).toContain("source IN ('rss', 'gdelt') AND meta->'symbols' ? $1");
  expect(bundle.documents.map((d) => d.id)).toEqual([2, 1, 4, 3]);
  expect(bundle.documents.find((d) => d.id === 4)).toMatchObject({ url: "https://example.com/4", publishedAt: "2026-09-02T00:00:00.000Z", displayAllowed: false, excerpt: "Stored catalyst text 4" });
});

it("accepts catalyst evidence at 89 days and rejects it at 91 days", async () => {
  const evidence = { claim: "fundamentals.productCatalyst", url: "https://example.com/filing", publishedAt: "2026-07-13", fiscalPeriod: "Q3 2026", quote: "The company launched a new chip." };
  expect(withinWindow({ docType: "news headline", publishedAt: "2026-07-13T00:00:00Z" }, asOf)).toBe(true);
  expect(withinWindow({ docType: "news headline", publishedAt: "2026-07-11T00:00:00Z" }, asOf)).toBe(false);
  expect(await offVerifier(evidence, asOf)).toBe(true);
  expect(await offVerifier({ ...evidence, publishedAt: "2026-07-11" }, asOf)).toBe(false);
});
