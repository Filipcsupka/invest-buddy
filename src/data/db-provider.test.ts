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
