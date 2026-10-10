import type pg from "pg";
import { describe, expect, it } from "vitest";
import type { ScoreResult } from "../engine";
import { ruleDetail } from "../i18n/score-text";
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

  const secUrl = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
  for (const carry of [false, true]) {
    it(`uses confirmed SEC revenue growth in the company detail (carry ${carry ? "on" : "off"})`, async () => {
      const secRows = [
        { ...row("revenueAccelerating", "xbrl_override", true), evidence_refs: [{ url: secUrl, publishedAt: "2026-10-05", quote: "Revenue growth 25.50% versus 10.25%" }] },
        row("revenueDeclining", "xbrl_override", false),
      ];
      const secPool = { query: async (sql: string) => ({ rows: sql.includes("FROM consensus_findings") ? secRows : [] }) } as unknown as pg.Pool;
      const provider = new DatabaseUniverseProvider(secPool, "2026-10-05", carry);
      const f = await provider.fundamentals("NVDA");
      expect(f).toMatchObject({ revenueAccelerating: true, revenueGrowthCurrent: 25.5, revenueGrowthPrior: 10.25 });
      const detail = ruleDetail("en", { id: "revenue-acceleration" } as ScoreResult["ruleHits"][number], { inputs: { fundamentals: f } } as ScoreResult);
      expect(detail).toBe("Revenue growth from 10% to 26%");
    });

    it(`does not show third-party or unverified revenue numbers (carry ${carry ? "on" : "off"})`, async () => {
      const badRows = [
        { ...row("revenueAccelerating", "data_rule", true), evidence_refs: [{ url: "https://www.alphavantage.co/query", quote: "Revenue growth 25.50% versus 10.25%" }] },
        { ...row("revenueDeclining", "xbrl_override", false, false), evidence_refs: [{ url: secUrl, quote: "Revenue growth 25.50% versus 10.25%" }] },
      ];
      const badPool = { query: async (sql: string) => ({ rows: sql.includes("FROM consensus_findings") ? badRows : [] }) } as unknown as pg.Pool;
      const provider = new DatabaseUniverseProvider(badPool, "2026-10-05", carry);
      expect(await provider.fundamentals("NVDA")).toMatchObject({ revenueGrowthCurrent: null, revenueGrowthPrior: null });
    });
  }

  it("drops SEC figures when the carried revenue finding expires", async () => {
    const old = { ...row("revenueAccelerating", "xbrl_override", true), as_of: "2026-06-01", carried_from: "2026-06-01", evidence_refs: [{ url: secUrl, publishedAt: "2026-06-01", quote: "Revenue growth 25.50% versus 10.25%" }] };
    const oldPool = { query: async (sql: string) => ({ rows: sql.includes("FROM consensus_findings") ? [old] : [] }) } as unknown as pg.Pool;
    const provider = new DatabaseUniverseProvider(oldPool, "2026-10-05", true);
    expect(await provider.fundamentals("NVDA")).toMatchObject({ revenueAccelerating: null, revenueGrowthCurrent: null, revenueGrowthPrior: null });
  });
});

it("limits daily instruments to membership active on the score date", async () => {
  let sql = "", params: unknown[] = [];
  const db = { query: async (statement: string, values: unknown[]) => {
    sql = statement; params = values;
    return { rows: [{ ticker: "NVDA", name: "NVIDIA", sector: "AI", tier: 1, source: "guide" }] };
  } } as unknown as pg.Pool;
  const instruments = await new DatabaseUniverseProvider(db, "2026-10-11").instruments();
  expect(instruments.map((row) => row.ticker)).toEqual(["NVDA"]);
  expect(sql).toContain("JOIN universe_membership m");
  expect(sql).toContain("m.valid_from <= COALESCE($1::date,CURRENT_DATE)");
  expect(sql).toContain("m.valid_to > COALESCE($1::date,CURRENT_DATE)");
  expect(params).toEqual(["2026-10-11"]);
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
