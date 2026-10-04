import { expect, it } from "vitest";
import { reconcileField, type AgentFinding } from "./reconcile";
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
