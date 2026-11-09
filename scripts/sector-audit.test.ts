import { describe, expect, it, vi } from "vitest";
import { auditSectorRows, formatSectorAudit, loadSectorAudit, SECTOR_AUDIT_SQL } from "./sector-audit";

describe("sector audit", () => {
  it("counts fillable names and named mismatches by vendor industry", () => {
    const report = auditSectorRows([
      { ticker: "US1", sector: "Unclassified", industry: "Semiconductors" },
      { ticker: "EU1", sector: "Biotech", industry: "Semiconductors" },
      { ticker: "US2", sector: "Unclassified", industry: "Banks - Regional" },
      { ticker: "EU2", sector: "Cloud & SaaS", industry: "Software - Application" },
      { ticker: "US3", sector: "Unclassified", industry: null },
    ]);
    expect(report).toMatchObject({ names: 5, unclassified: 3, fillable: 1, mismatchedNamed: 1, missingIndustry: 1 });
    expect(report.industries.find((row) => row.industry === "Semiconductors"))
      .toEqual({ industry: "Semiconductors", proposedSector: "AI & semiconductors", names: 2, unclassified: 1, fillable: 1, mismatchedNamed: 1 });
    expect(report.industries.find((row) => row.industry === "Banks - Regional")?.proposedSector).toBe("Unclassified");
    expect(formatSectorAudit(report)).toContain("| Semiconductors | 2 | 1 | 1 | 1 | AI & semiconductors |");
  });

  it("runs only a bounded SELECT inside a read-only transaction", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql === SECTOR_AUDIT_SQL ? [{ ticker: "A", sector: "Unclassified", industry: "Semiconductors" }] : [] }));
    const release = vi.fn();
    const result = await loadSectorAudit({ connect: async () => ({ query, release }) } as never);
    expect(result.fillable).toBe(1);
    expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN TRANSACTION READ ONLY", SECTOR_AUDIT_SQL, "ROLLBACK"]);
    expect(SECTOR_AUDIT_SQL).toContain("LIMIT 10001");
    expect(release).toHaveBeenCalledOnce();
  });

  it("refuses a silently truncated audit", () => {
    expect(() => auditSectorRows(Array.from({ length: 10_001 }, () => ({ ticker: "A", sector: "Unclassified", industry: null })))).toThrow(/exceeds/);
  });
});
