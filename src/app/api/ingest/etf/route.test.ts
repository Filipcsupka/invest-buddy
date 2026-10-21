import { describe, expect, it } from "vitest";
import { authorized, validatePayload } from "./route";

const candidate = {
  symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF", isin: null, assetClass: "equity", region: "US", call: "BUY_ZONE", conviction: 3,
  thesis: "A broad index fund", whatHappened: [], whyItMatters: "Low cost", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
  cost: { terPct: 0.1, aumUsdM: 100, trackedIndex: "Test Index", domicile: "US", replication: "physical" },
  price: { last: 100, currency: "USD", asOf: "2026-10-20" },
  evidence: [{ url: "https://example.com/etf", quote: "The total expense ratio is zero point one percent.", claim: "ter" }],
};
const sample = { run: { id: "00000000-0000-4000-8000-000000000001", asOf: "2026-10-21", adapter: "codex", model: "test", promptVersion: "test",
  status: "ok", stopReason: null, startedAt: "2026-10-21T07:00:00Z", finishedAt: "2026-10-21T07:10:00Z", usage: {} },
  output: { asOf: "2026-10-21", candidates: [candidate] } };

describe("ETF ingest contract", () => {
  it("accepts the ETF schema and rejects duplicate, future, and nonpositive prices", () => {
    expect(validatePayload(sample)).toEqual([]);
    const bad = structuredClone(sample);
    bad.output.candidates.push({ ...candidate, price: { last: 0, currency: "USD", asOf: "2026-10-22" } });
    expect(validatePayload(bad).join(" ")).toMatch(/duplicate/);
    expect(validatePayload(bad).join(" ")).toMatch(/positive/);
    expect(validatePayload(bad).join(" ")).toMatch(/after run date/);
  });
  it("requires the ingest token", () => {
    expect(authorized("Bearer secret", "secret")).toBe(true);
    expect(authorized("Bearer wrong", "secret")).toBe(false);
    expect(authorized(null, "secret")).toBe(false);
  });
});
