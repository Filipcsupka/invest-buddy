import { describe, expect, it } from "vitest";
import { ingestEnrichment, type Enrichment } from "./etf-catalog-ingest";

const item: Enrichment = { listingKey: "NYSEARCA:SPY", isin: "US78462F1030", issuer: "State Street", assetClass: "equity", region: "US", theme: null, trackedIndex: "S&P 500", terPct: 0.09, aumUsdM: 600000, domicile: "US", replication: "physical", distribution: "dist", ucits: false, sourceUrl: "https://example.com" };

describe("catalog enrichment status", () => {
  it("sets ok for complete facts and failed for missing core facts, incrementing only failed attempts", async () => {
    const updates: { sql: string; args: unknown[] }[] = [];
    const db = { connect: async () => ({ query: async (sql: string, args: unknown[] = []) => { if (sql.includes("UPDATE etf_catalog SET issuer")) updates.push({ sql, args }); return { rowCount: 1 }; }, release() {} }) };
    await ingestEnrichment(db as never, [item,{ ...item, listingKey: "NASDAQ:TEST", terPct: null }]);
    expect(updates[0].args[13]).toBe("ok");
    expect(updates[1].args[13]).toBe("failed");
    await ingestEnrichment(db as never, [{ ...item, listingKey: "XETR:TEST", source: "eodhd", issuer: null, sourceUrl: null }]);
    expect(updates[2].args[13]).toBe("eodhd_unmapped");
    await ingestEnrichment(db as never, [{ ...item, listingKey: "XETR:PARTIAL", source: "eodhd", issuer: null }]);
    expect(updates[3].args[13]).toBe("eodhd_incomplete");
    expect(updates[0].sql).toContain("enrich_attempts=enrich_attempts+CASE WHEN $14='failed' THEN 1 ELSE 0 END");
    expect(updates[0].sql).toContain("enrich_attempts<3");
  });
});
