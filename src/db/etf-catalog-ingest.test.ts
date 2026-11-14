import { describe, expect, it, vi } from "vitest";
import { ingestEnrichment, type Enrichment } from "./etf-catalog-ingest";

const item: Enrichment = { listingKey: "NYSEARCA:SPY", isin: "US78462F1030", issuer: "State Street", assetClass: "equity", region: "US", theme: null, trackedIndex: "S&P 500", terPct: 0.09, aumUsdM: 600000, domicile: "US", replication: "physical", distribution: "dist", ucits: false, sourceUrl: "https://example.com" };

describe("catalog enrichment status", () => {
  it("counts every incomplete enrichment attempt and preserves known UCITS status", async () => {
    const updates: { sql: string; args: unknown[] }[] = [];
    const db = { connect: async () => ({ query: async (sql: string, args: unknown[] = []) => { if (sql.includes("UPDATE etf_catalog SET issuer")) updates.push({ sql, args }); return { rowCount: 1 }; }, release() {} }) };
    await ingestEnrichment(db as never, [item,{ ...item, listingKey: "NASDAQ:TEST", terPct: null }]);
    expect(updates[0].args[13]).toBe("ok");
    expect(updates[0].args[3]).toBeNull();
    expect(updates[1].args[13]).toBe("failed");
    await ingestEnrichment(db as never, [{ ...item, listingKey: "XETR:TEST", source: "eodhd", issuer: null, sourceUrl: null }]);
    expect(updates[2].args[13]).toBe("eodhd_unmapped");
    await ingestEnrichment(db as never, [{ ...item, listingKey: "XETR:PARTIAL", source: "eodhd", issuer: null }]);
    expect(updates[3].args[13]).toBe("eodhd_incomplete");
    expect(updates[0].sql).toContain("ucits=COALESCE($12,ucits)");
    expect(updates[0].sql).toMatch(/enrich_attempts=enrich_attempts\+CASE WHEN \$14 IN \('failed','eodhd_unmapped','eodhd_incomplete'\) THEN 1 ELSE 0 END/);
    expect(updates[0].sql).toContain("enrich_attempts<3");
  });
  it("normalizes legacy labels before writing", async () => {
    const regions: unknown[] = [];
    const db = { connect: async () => ({ query: async (sql: string, args: unknown[] = []) => { if (sql.includes("UPDATE etf_catalog SET issuer")) regions.push(args[3]); return { rowCount: 1 }; }, release() {} }) };
    await ingestEnrichment(db as never, [{ ...item, region: "GLOBAL" }, { ...item, region: "united states" }, { ...item, region: "global ex united states" }]);
    expect(regions).toEqual(["Global", "North America", "Global ex US"]);
  });
});

it("warns about non-empty unmapped regions during ingestion", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const db = { connect: async () => ({ query: async () => ({ rowCount: 1 }), release() {} }) };
  try {
    await ingestEnrichment(db as never, [{ ...item, region: "Unknown place" }, { ...item, region: " " }, { ...item, region: null }]);
    expect(warning).toHaveBeenCalledExactlyOnceWith("ETF region not mapped: Unknown place");
  } finally { warning.mockRestore(); }
});
