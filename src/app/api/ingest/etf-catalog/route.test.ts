import { describe, expect, it } from "vitest";
import { authorized, validateEnrichment, POST } from "./route";
import { GET as pending } from "./pending/route";
import { GET as shortlist } from "./shortlist/route";
import { enrichmentComplete, type Enrichment } from "../../../../db/etf-catalog-ingest";

const item: Enrichment = { listingKey: "NYSEARCA:SPY", isin: null, issuer: "State Street", assetClass: "equity", region: "US", theme: null, trackedIndex: "S&P 500", terPct: 0.09, aumUsdM: 600000, domicile: "US", replication: "physical", distribution: "dist", ucits: false, sourceUrl: "https://example.com/spy" };
describe("ETF catalog ingest", () => {
  it("requires bearer auth and validates a batch by listing key", () => {
    expect(authorized("Bearer secret", "secret")).toBe(true);
    expect(authorized("Bearer wrong", "secret")).toBe(false);
    expect(validateEnrichment({ items: [item] })).toEqual([]);
    expect(validateEnrichment({ items: [item,item] }).join(" ")).toMatch(/duplicate/);
    expect(validateEnrichment({ items: [{ ...item, sourceUrl: "http://example.com" }] }).length).toBeGreaterThan(0);
  });
  it("rejects unauthenticated requests at all catalog ingest endpoints", async () => {
    const prior = process.env.INGEST_TOKEN; process.env.INGEST_TOKEN = "test-token";
    try {
      expect((await POST(new Request("http://localhost/api/ingest/etf-catalog", { method: "POST", body: "{}" }))).status).toBe(401);
      expect((await pending(new Request("http://localhost/api/ingest/etf-catalog/pending"))).status).toBe(401);
      expect((await shortlist(new Request("http://localhost/api/ingest/etf-catalog/shortlist"))).status).toBe(401);
    } finally { if (prior === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = prior; }
  });
  it("marks incomplete enrichment as failed", () => {
    expect(enrichmentComplete(item)).toBe(true);
    expect(enrichmentComplete({ ...item, terPct: null })).toBe(false);
    expect(enrichmentComplete({ ...item, issuer: null })).toBe(false);
  });
});
