import { expect, it } from "vitest";
import type pg from "pg";
import { guardReconcileUserAgent, reconcileField, selectVerifier, type AgentFinding } from "./reconcile";
import { fixtureVerifier, liveVerifier, offVerifier } from "../data/evidence";
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

it("live reconcile refuses a missing or placeholder SEC_USER_AGENT; off and fixture modes do not need one", () => {
  for (const env of [{}, { SEC_USER_AGENT: "Porgy REPLACE_WITH_CONTACT_EMAIL" }]) {
    expect(() => guardReconcileUserAgent("live", env)).toThrow(/SEC_USER_AGENT/);
    expect(() => guardReconcileUserAgent("off", env)).not.toThrow();
    expect(() => guardReconcileUserAgent("fixture", env)).not.toThrow();
  }
  expect(() => guardReconcileUserAgent("live", { SEC_USER_AGENT: "Porgy ops@example.com" })).not.toThrow();
});
