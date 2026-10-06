import { describe, expect, it } from "vitest";
import type pg from "pg";
import { guardReconcileUserAgent, reconcileField, selectVerifier, type AgentFinding } from "./reconcile";
import { fixtureVerifier, liveVerifier, offVerifier } from "../data/evidence";
import { storedOnlyVerifier } from "../data/stored-evidence";
import { epsBeatMinSurprisePct, epsFromFact } from "../data/eps";
const finding = (name: "claude" | "codex", value: boolean): AgentFinding => ({ runId: `${name}-run`, runner: { name }, fundamentals: { epsBeat: value }, evidence: { items: [{ claim: "fundamentals.epsBeat", url: "https://example.com/result", publishedAt: "2026-10-03", fiscalPeriod: "Q2 FY2027", quote: "Revenue rose." }] }, confidence: "high" });
it("keeps a disagreement unknown and retains both agent runs", async () => {
  const result = await reconcileField("NVDA", "epsBeat", "2026-10-04", [finding("claude",true), finding("codex",false)], async () => true);
  expect(result).toMatchObject({ agreement: "disputed", value: null, verified: false, agentValues: { claude: { runId: "claude-run" }, codex: { runId: "codex-run" } } });
});
it("requires independently checked evidence from both agreeing agents", async () => {
  const both = [finding("claude",true), finding("codex",true)];
  expect((await reconcileField("NVDA","epsBeat","2026-10-04",both,async () => true)).value).toBe(true);
  expect((await reconcileField("NVDA","epsBeat","2026-10-04",both,async (entry) => entry.url.includes("none"))).value).toBeNull();
});
it("lets SEC revenue facts override a conflicting agent claim", async () => {
  const result = await reconcileField("NVDA","revenueAccelerating","2026-10-04", [{ ...finding("claude",false), fundamentals: { revenueAccelerating: false } }],async () => false,{ currentGrowth: 50, priorGrowth: 20, revenueAccelerating: true, revenueDeclining: false, period: "Q2 FY2026", source: "https://data.sec.gov/facts" });
  expect(result).toMatchObject({ agreement: "xbrl_override", value: true, verified: true });
});

it("accepts two confident false claims without fetching a page", async () => {
  const both = [finding("claude",false), finding("codex",false)].map((item) => ({ ...item, evidence: { items: [] } }));
  const verify = async () => { throw new Error("false must not fetch evidence"); };
  expect(await reconcileField("NVDA","epsBeat","2026-10-04",both,verify)).toMatchObject({ agreement: "agree", value: false, verified: true });
});
it("keeps off and fixture modes as they were and reads stored documents first in live mode", async () => {
  const pool = { query: async () => ({ rows: [{ body: "Revenue rose 56%", published_at: new Date("2026-09-20T00:00:00Z") }] }) } as unknown as pg.Pool;
  expect(selectVerifier("off", pool)).toBe(offVerifier);
  expect(selectVerifier("fixture", pool)).toBe(fixtureVerifier);
  const live = selectVerifier("live", pool);
  expect(live).not.toBe(liveVerifier);
  expect(await live({ claim: "fundamentals.epsBeat", url: "https://stored.example/a", publishedAt: "2026-09-20", fiscalPeriod: "Q2", quote: "revenue rose 56%" }, "2026-10-05")).toBe(true);
});

describe("one extractor (verified_single)", () => {
  const quote = "Non-GAAP EPS of $1.05 exceeded our outlook";
  const doc = { body: `NVIDIA results. ${quote}. Revenue rose.`, publishedAt: "2026-08-27T00:00:00.000Z", displayAllowed: true };
  const single = (value: unknown, over: Partial<AgentFinding> = {}): AgentFinding[] => [{ runId: "claude-run", runner: { name: "claude" }, fundamentals: { epsBeat: value, guidanceRaised: value, narrativeChanged: value, productCatalyst: value },
    evidence: { items: ["epsBeat", "guidanceRaised", "narrativeChanged", "productCatalyst"].map((field) => ({ claim: `fundamentals.${field}`, url: "https://www.sec.gov/ex99.htm", publishedAt: "2026-08-27", fiscalPeriod: "Q2 FY2027", quote })) }, confidence: "medium", ...over }];
  const stored = (found: typeof doc | null) => storedOnlyVerifier(async () => found);
  const never = async () => { throw new Error("the two-agent verifier is not used for one extractor"); };

  it("counts a true or false claim whose quote is in a stored, display-allowed document", async () => {
    for (const value of [true, false]) {
      const result = await reconcileField("NVDA", "epsBeat", "2026-10-05", single(value), never, null, null, { storedVerify: stored(doc) });
      expect(result).toMatchObject({ agreement: "verified_single", value, verified: true, agentValues: { claude: { value, runId: "claude-run" } } });
    }
    const catalyst = await reconcileField("NVDA", "productCatalyst", "2026-09-10", single({ present: true, note: "launch" }), never, null, null, { storedVerify: stored(doc) });
    expect(catalyst).toMatchObject({ agreement: "verified_single", value: true, verified: true });
  });
  it("keeps the field unknown when the quote is not in the stored text, the document is not display-allowed or not stored", async () => {
    for (const found of [{ ...doc, body: "NVIDIA results. Revenue rose." }, { ...doc, displayAllowed: false }, null]) {
      const result = await reconcileField("NVDA", "epsBeat", "2026-10-05", single(true), never, null, null, { storedVerify: stored(found) });
      expect(result).toMatchObject({ agreement: "single", value: null, verified: false });
    }
  });
  it("keeps null, low confidence, narrative fields and runs without a stored verifier unknown", async () => {
    expect(await reconcileField("NVDA", "epsBeat", "2026-10-05", single(null), never, null, null, { storedVerify: stored(doc) })).toMatchObject({ agreement: "single", value: null, verified: false });
    expect(await reconcileField("NVDA", "epsBeat", "2026-10-05", single(true, { confidence: "low" }), never, null, null, { storedVerify: stored(doc) })).toMatchObject({ agreement: "single", value: null, verified: false });
    expect(await reconcileField("NVDA", "narrativeChanged", "2026-10-05", single(true), never, null, null, { storedVerify: stored(doc) })).toMatchObject({ value: null, verified: false });
    expect(await reconcileField("NVDA", "epsBeat", "2026-10-05", single(true), async () => true)).toMatchObject({ agreement: "single", value: null, verified: false });
  });
  it("keeps the disagreement rule when a second agent exists", async () => {
    const both = [finding("claude", true), finding("codex", false)];
    expect(await reconcileField("NVDA", "epsBeat", "2026-10-04", both, async () => true, null, null, { storedVerify: async () => true })).toMatchObject({ agreement: "disputed", value: null, verified: false });
  });
  it("lets SEC revenue facts override a verified single claim and keeps the agent value", async () => {
    const one = [{ ...finding("claude", false), fundamentals: { revenueAccelerating: false }, evidence: { items: [{ claim: "fundamentals.revenueAccelerating", url: "https://www.sec.gov/ex99.htm", publishedAt: "2026-08-27", fiscalPeriod: "Q2", quote }] } }];
    const result = await reconcileField("NVDA", "revenueAccelerating", "2026-10-05", one, never, { currentGrowth: 50, priorGrowth: 20, revenueAccelerating: true, revenueDeclining: false, period: "Q2 FY2026", source: "https://data.sec.gov/facts" }, null, { storedVerify: stored(doc) });
    expect(result).toMatchObject({ agreement: "xbrl_override", value: true, verified: true, agentValues: { claude: { value: false } } });
  });
});

describe("epsBeat from Alpha Vantage (data_rule)", () => {
  const fact = (reportedDate: string, surprisePercent: number | null) => ({ asOf: reportedDate, value: { reportedDate, fiscalDateEnding: "2026-07-31", reportedEps: 1.05, estimatedEps: 1, surprisePercent } });
  const url = "https://www.alphavantage.co/query?function=EARNINGS&symbol=NVDA#2026-08-27";
  const agent = (value: boolean) => [finding("claude", value)];

  it("sets true for a positive surprise and false for zero or negative, verified, with the source in the reason and no figures", async () => {
    const yes = await reconcileField("NVDA", "epsBeat", "2026-10-05", [], async () => false, null, null, { eps: epsFromFact(fact("2026-08-27", 4.5), url, "2026-10-05") });
    expect(yes).toMatchObject({ agreement: "data_rule", value: true, verified: true, evidenceRefs: [{ claim: "fundamentals.epsBeat", url, publishedAt: "2026-08-27" }] });
    expect(yes.reason).toContain("Alpha Vantage");
    expect(yes.reason).not.toMatch(/4\.5|1\.05/);
    for (const surprise of [0, -3]) {
      expect(await reconcileField("NVDA", "epsBeat", "2026-10-05", [], async () => false, null, null, { eps: epsFromFact(fact("2026-08-27", surprise), url, "2026-10-05") })).toMatchObject({ agreement: "data_rule", value: false, verified: true });
    }
  });
  it("overrides a conflicting agent claim and keeps the agent value", async () => {
    const result = await reconcileField("NVDA", "epsBeat", "2026-10-05", agent(true), async () => true, null, null, { eps: epsFromFact(fact("2026-08-27", -1), url, "2026-10-05") });
    expect(result).toMatchObject({ agreement: "data_rule", value: false, verified: true, agentValues: { claude: { value: true } } });
    expect(result.reason).toMatch(/overrides agent claim/);
  });
  it("does not decide for a stale fact, a fact without a surprise, or no fact", async () => {
    expect(epsFromFact(fact("2026-06-26", 5), url, "2026-10-05")).toMatchObject({ value: null, reason: expect.stringContaining("older than 100 days") });
    expect(epsFromFact(fact("2026-08-27", null), url, "2026-10-05")).toMatchObject({ value: null });
    expect(epsFromFact(null, null, "2026-10-05")).toBeNull();
    expect(epsFromFact(fact("2026-10-06", 5), url, "2026-10-05")).toBeNull();
    for (const eps of [epsFromFact(fact("2026-06-26", 5), url, "2026-10-05"), null]) {
      expect(await reconcileField("NVDA", "epsBeat", "2026-10-05", agent(true), async () => true, null, null, { eps })).toMatchObject({ agreement: "single", value: null, verified: false });
    }
  });
  it("uses the configured threshold", () => {
    expect(epsBeatMinSurprisePct({})).toBe(0);
    expect(epsBeatMinSurprisePct({ EPS_BEAT_MIN_SURPRISE_PCT: "2.5" })).toBe(2.5);
    expect(epsBeatMinSurprisePct({ EPS_BEAT_MIN_SURPRISE_PCT: "x" })).toBe(0);
    expect(epsFromFact(fact("2026-08-27", 2), url, "2026-10-05", 2.5)?.value).toBe(false);
    expect(epsFromFact(fact("2026-08-27", 3), url, "2026-10-05", 2.5)?.value).toBe(true);
  });
});

it("live reconcile refuses a missing or placeholder SEC_USER_AGENT; off and fixture modes do not need one", () => {
  for (const env of [{}, { SEC_USER_AGENT: "Porgy REPLACE_WITH_CONTACT_EMAIL" }]) {
    expect(() => guardReconcileUserAgent("live", env)).toThrow(/SEC_USER_AGENT/);
    expect(() => guardReconcileUserAgent("off", env)).not.toThrow();
    expect(() => guardReconcileUserAgent("fixture", env)).not.toThrow();
  }
  expect(() => guardReconcileUserAgent("live", { SEC_USER_AGENT: "Porgy ops@example.com" })).not.toThrow();
});
