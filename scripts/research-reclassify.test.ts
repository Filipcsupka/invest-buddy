import { describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { reclassifyFinding, runResearchReclassify, type FindingRow } from "./research-reclassify";

const row: FindingRow = {
  id: 1, symbol: "SIE", source_class: "aggregator", confirmed: false, display_quote: false,
  evidence: [{ url: "https://press.siemens.com/global/en/pressrelease/test", sourceName: "Siemens", verify: {
    status: "verified", sourceClass: "aggregator", canonicalUrl: "https://press.siemens.com/global/en/pressrelease/test", displayQuote: false,
  } }],
};

describe("research source reclassification", () => {
  it("upgrades stored company evidence and its dependent confirmation", () => {
    const result = reclassifyFinding(row)!;
    expect(result).toMatchObject({ sourceClass: "primary", confirmed: true, displayQuote: false });
    expect(result.evidence[0].verify?.sourceClass).toBe("primary");
    expect(reclassifyFinding({ ...row, source_class: result.sourceClass, confirmed: result.confirmed,
      display_quote: result.displayQuote, evidence: result.evidence })).toBeNull();
  });
  it("never lowers an existing class and uses the verified canonical URL", () => {
    const result = reclassifyFinding({ ...row, symbol: "UNKNOWN", source_class: "press",
      evidence: [{ ...row.evidence[0], url: "https://example.com/redirect", verify: {
        ...row.evidence[0].verify, canonicalUrl: "https://www.sec.gov/Archives/test", sourceClass: "press",
      } }] });
    expect(result?.sourceClass).toBe("primary");
    expect(reclassifyFinding({ ...row, symbol: "UNKNOWN", source_class: "primary", confirmed: true,
      evidence: [{ ...row.evidence[0], url: "https://example.com/test", verify: {
        ...row.evidence[0].verify, canonicalUrl: "https://example.com/test", sourceClass: "primary",
      } }] })).toBeNull();
  });
  it("writes only with --apply", async () => {
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT") ? { rows: [row] } : { rows: [] });
    const release = vi.fn();
    const pool = { query, connect: async () => ({ query, release }) } as unknown as pg.Pool;
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await runResearchReclassify(pool);
      expect(query.mock.calls.map(([sql]) => sql)).not.toContainEqual(expect.stringContaining("UPDATE research_findings"));
      query.mockClear();
      await runResearchReclassify(pool, true);
      expect(query.mock.calls.map(([sql]) => sql)).toContainEqual(expect.stringContaining("UPDATE research_findings"));
      expect(query.mock.calls.map(([sql]) => sql)).toContain("COMMIT");
      expect(release).toHaveBeenCalledOnce();
    } finally { output.mockRestore(); }
  });
});
