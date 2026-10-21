import { describe, expect, it } from "vitest";
import { insertEtfResearch, verificationStatus, type EtfCandidate, type EtfPayload, type VerifiedEvidence } from "./etf-ingest";

const card = (call: EtfCandidate["call"] = "BUY_ZONE", price = 100): EtfCandidate => ({
  symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF", isin: null, assetClass: "equity", region: "US", call, conviction: 3,
  thesis: "A broad index fund", whatHappened: [], whyItMatters: "Low cost", plan: { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: [],
  cost: { terPct: 0.1, aumUsdM: 100, trackedIndex: "Test Index", domicile: "US", replication: "physical" },
  price: { last: price, currency: "USD", asOf: "2026-10-20" },
  evidence: [{ url: "https://example.com/etf", quote: "The total expense ratio is zero point one percent.", claim: "ter" }],
});
const payload = (id: string, c: EtfCandidate): EtfPayload => ({
  run: { id, asOf: "2026-10-21", adapter: "codex", model: "test", promptVersion: "test", status: "ok", stopReason: null,
    startedAt: "2026-10-21T07:00:00Z", finishedAt: "2026-10-21T07:10:00Z", usage: {} },
  output: { asOf: "2026-10-21", candidates: [c] },
});
const evidence = (statuses: ("verified" | "quote_not_found")[]): VerifiedEvidence[] => statuses.map((status) => ({
  url: "https://example.com/etf", quote: "A source quote", claim: "ter", status, reason: status,
  verified: status === "verified", canonicalUrl: null, displayQuote: status === "verified",
}));

class FakeDb {
  runs = new Set<string>();
  picks = new Map<string, { entryPrice: number | null; entryDate: string | null; status: string; listingKey: string }>();
  histories = new Set<string>();
  async connect() { return { query: this.query.bind(this), release() {} }; }
  async query(sql: string, args: unknown[] = []) {
    if (sql.includes("SELECT listing_key,isin FROM etf_catalog")) return { rowCount: 1, rows: [{ listing_key: "NYSEARCA:ETF1", isin: null }] };
    if (sql.includes("SELECT symbol FROM etf_picks")) return { rowCount: 0, rows: [] };
    if (sql.includes("SELECT id FROM etf_research_runs")) return { rowCount: this.runs.has(String(args[0])) ? 1 : 0, rows: [] };
    if (sql.includes("INSERT INTO etf_research_runs")) {
      if (this.runs.has(String(args[0]))) return { rowCount: 0, rows: [] };
      this.runs.add(String(args[0])); return { rowCount: 1, rows: [{ id: args[0] }] };
    }
    if (sql.includes("INSERT INTO etf_picks")) {
      const old = this.picks.get(String(args[0]));
      this.picks.set(String(args[0]), { entryPrice: old?.entryPrice ?? args[27] as number | null,
        entryDate: old?.entryDate ?? args[28] as string | null, status: String(args[22]), listingKey: String(args[29]) });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("INSERT INTO etf_pick_history")) this.histories.add(`${args[0]}:${args[1]}`);
    return { rowCount: 0, rows: [] };
  }
}

describe("ETF ingest", () => {
  it("marks all, some, or no verified quotes without discarding failed quotes", () => {
    expect(verificationStatus(evidence(["verified", "verified"]))).toBe("verified");
    expect(verificationStatus(evidence(["verified", "quote_not_found"]))).toBe("partial");
    expect(verificationStatus(evidence(["quote_not_found"]))).toBe("unverified");
  });
  it("does not repeat a run and sets the first BUY_ZONE entry only once", async () => {
    const db = new FakeDb();
    const verify = async () => evidence(["verified"]);
    const first = await insertEtfResearch(db as never, payload("00000000-0000-4000-8000-000000000001", card("WATCH", 90)), verify);
    expect(first).toEqual({ replayed: false, picks: 1, verified: 1 });
    expect(db.picks.get("ETF1")?.entryPrice).toBeNull();
    expect(db.picks.get("ETF1")?.listingKey).toBe("NYSEARCA:ETF1");
    await insertEtfResearch(db as never, payload("00000000-0000-4000-8000-000000000002", card("BUY_ZONE", 100)), verify);
    expect(db.picks.get("ETF1")).toMatchObject({ entryPrice: 100, entryDate: "2026-10-20" });
    await insertEtfResearch(db as never, payload("00000000-0000-4000-8000-000000000003", card("BUY_ZONE", 120)), verify);
    expect(db.picks.get("ETF1")?.entryPrice).toBe(100);
    const replay = await insertEtfResearch(db as never, payload("00000000-0000-4000-8000-000000000003", card("AVOID", 60)), async () => { throw new Error("verification ran on replay"); });
    expect(replay).toEqual({ replayed: true, picks: 0, verified: 0 });
    expect(db.histories.size).toBe(3);
  });
});
