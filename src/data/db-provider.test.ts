import type pg from "pg";
import { describe, expect, it } from "vitest";
import { DatabaseUniverseProvider } from "./db-provider";

const row = (field: string, agreement: string, value: boolean | null, verified = true) => ({ field, as_of: "2026-10-05", carried_from: null, value, agreement, agent_values: { claude: { value, runId: "c1" } }, evidence_refs: [], reason: "r", verified });
const rows = [
  row("epsBeat", "data_rule", true),
  row("guidanceRaised", "verified_single", true),
  row("guidanceCut", "verified_single", false),
  row("productCatalyst", "single", true, false),
  row("revenueAccelerating", "xbrl_override", true),
  row("revenueDeclining", "agree", false),
  row("insiderOrInstitutionalBuying", "disputed", null, false),
];
const pool = { query: async (sql: string) => ({ rows: sql.includes("FROM consensus_findings") && !sql.includes("field IN") ? rows : [] }) } as unknown as pg.Pool;

describe("DatabaseUniverseProvider fundamentals", () => {
  for (const carry of [false, true]) {
    it(`counts verified_single and data_rule like agree and xbrl_override (carry ${carry ? "on" : "off"})`, async () => {
      const provider = new DatabaseUniverseProvider(pool, "2026-10-05", carry);
      const f = await provider.fundamentals("NVDA");
      expect(f).toMatchObject({ epsBeat: true, guidanceRaised: true, earningsMissAndGuidanceCut: false, productCatalyst: null, revenueAccelerating: true, revenueDeclining: false, insiderOrInstitutionalAccumulation: null });
      expect(provider.provenance.get("NVDA")?.consensusValues).toMatchObject({ epsBeat: true, guidanceRaised: true, guidanceCut: false, productCatalyst: null });
      expect(provider.provenance.get("NVDA")?.agreement).toMatchObject({ epsBeat: "data_rule", guidanceRaised: "verified_single" });
    });
  }
});

describe("DatabaseUniverseProvider sources", () => {
  const REL = "https://www.sec.gov/Archives/edgar/data/1/ex99.htm", AV = "https://www.alphavantage.co/query?function=EARNINGS&symbol=NVDA";
  const withRefs = [
    { ...row("epsBeat", "data_rule", true), evidence_refs: [{ url: AV, publishedAt: "2026-08-26" }] },
    { ...row("guidanceRaised", "verified_single", true), evidence_refs: [{ url: REL, publishedAt: "2026-08-26" }] },
  ];
  let docQueries = 0;
  const pool2 = { query: async (sql: string) => {
    if (sql.includes("FROM source_documents")) { docQueries++; return { rows: [{ url: REL, doc_type: "8-K EX-99.1", published_at: "2026-08-26", display_allowed: "true" }, { url: AV, doc_type: "EPS surprise", published_at: "2026-08-26", display_allowed: "false" }] }; }
    return { rows: sql.includes("FROM consensus_findings") && !sql.includes("field IN") ? withRefs : [] };
  } } as unknown as pg.Pool;
  for (const carry of [false, true]) {
    it(`links only the display-allowed document, with one document query (carry ${carry ? "on" : "off"})`, async () => {
      docQueries = 0;
      const provider = new DatabaseUniverseProvider(pool2, "2026-10-05", carry);
      await provider.fundamentals("NVDA");
      expect(docQueries).toBe(1);
      expect(provider.provenance.get("NVDA")?.sources).toEqual({
        epsBeat: [{ kind: "alphavantage", href: null, publishedAt: "2026-08-26" }],
        guidanceRaised: [{ kind: "release", href: REL, publishedAt: "2026-08-26" }],
      });
    });
  }
});
