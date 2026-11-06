import { afterEach, describe, expect, it } from "vitest";
import { etfDetail, etfList, etfOutcomes, mapEtfPick, summarizeEtfOutcomes } from "@/db/etf";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

describe("ETF read model", () => {
  it("provides nine sample funds across asset classes and stamps fixture mode", async () => {
    process.env.DATA_MODE = "fixture";
    const list = await etfList(null);
    expect(list.sample).toBe(true);
    expect(list.picks).toHaveLength(9);
    expect(new Set(list.picks.map((pick) => pick.assetClass)).size).toBe(5);
    expect(list.picks.every((pick) => pick.verificationStatus === "unverified")).toBe(true);
    expect((await etfDetail("VWRA", null))?.history).toHaveLength(2);
    expect((await etfDetail("BAD", null))).toBeNull();
  });

  it("keeps unknown numeric and evidence values honest", () => {
    const pick = mapEtfPick({ symbol: "TEST", exchange: null, name: "Test fund", isin: null, asset_class: "bond", region: null,
      call: "WATCH", conviction: null, thesis: "", what_happened: [], why_it_matters: "", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
      ter_pct: null, aum_usd_m: null, tracked_index: null, domicile: null, replication: null, price: null, price_currency: null, price_as_of: null,
      evidence: [{ url: "https://example.org/fund", quote: "A source quote", claim: "ter", verification_status: "unverified" }], verification_status: "partial",
      first_seen_at: "2026-10-20", last_seen_at: "2026-10-20", benchmark_symbol: "SPY" });
    expect(pick.price).toBeNull();
    expect(pick.terPct).toBeNull();
    expect(pick.evidence[0].verified).toBe(false);
  });

  it("counts only measured excess returns and uses the middle two for even medians", async () => {
    process.env.DATA_MODE = "fixture";
    const { outcomes } = await etfOutcomes(null);
    const summary = summarizeEtfOutcomes(outcomes);
    expect(summary[0]).toMatchObject({ horizonDays: 30, count: 2, meanExcess: -0.4, medianExcess: -0.4, hitRate: 0.5 });
    expect(summary[3]).toMatchObject({ horizonDays: 180, count: 0, meanExcess: null, hitRate: null });
  });
});
