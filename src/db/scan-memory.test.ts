import { expect, it } from "vitest";
import { scanSchema } from "../data/scan";
import { MemoryScanRepository } from "./scan-memory";
const base = {
  schemaVersion: 2, runId: "3f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08", asOf: "2026-10-03", generatedAt: "2026-10-04T05:30:00Z", runner: { name: "claude", model: "test" },
  tickers: [{ symbol: "NVDA", fundamentals: { revenueAccelerating: true, revenueDeclining: null, epsBeat: null, guidanceRaised: null, guidanceCut: null, productCatalyst: null, insiderOrInstitutionalBuying: null, narrativeChanged: null }, evidence: [], confidence: "high" }],
  macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "", evidence: [], events: [] },
};
it("keeps unsupported claims, replays run IDs, and supersedes same-day findings", () => {
  const repo = new MemoryScanRepository(new Set(["NVDA"]));
  const first = scanSchema.parse(base);
  expect(repo.ingest(first)).toEqual({ accepted: 1, rejected: [], replayed: false });
  expect(repo.latest("NVDA")?.evidence.flags["fundamentals.revenueAccelerating"]).toBe(false);
  expect(repo.ingest(first).replayed).toBe(true);
  const second = scanSchema.parse({ ...base, runId: "4f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08", tickers: [{ ...base.tickers[0], evidence: [{ claim: "fundamentals.revenueAccelerating", url: "https://example.com/results", publishedAt: "2026-10-03", fiscalPeriod: "Q2 FY2027", quote: "Revenue rose." }] }] });
  repo.ingest(second);
  expect(repo.findings[0].supersededBy).toBe(second.runId);
  expect(repo.latest("NVDA")?.evidence.flags["fundamentals.revenueAccelerating"]).toBe(true);
});
it("keeps both agents and reconciles their conflicting fields", async () => {
  const repo = new MemoryScanRepository(new Set(["NVDA"]));
  const claude = scanSchema.parse({ ...base, tickers: [{ ...base.tickers[0], fundamentals: { ...base.tickers[0].fundamentals, revenueAccelerating: null, epsBeat: true }, evidence: [{ claim: "fundamentals.epsBeat", url: "https://example.com/results", publishedAt: "2026-10-03", fiscalPeriod: "Q2 FY2027", quote: "Earnings beat." }] }] });
  const codex = scanSchema.parse({ ...base, runId: "5f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08", runner: { name: "codex", model: "test" }, tickers: [{ ...base.tickers[0], fundamentals: { ...base.tickers[0].fundamentals, revenueAccelerating: null, epsBeat: false } }] });
  repo.ingest(claude); repo.ingest(codex);
  expect(repo.findings.filter((item) => item.supersededBy === null)).toHaveLength(2);
  await repo.reconcile("2026-10-03", async () => true);
  expect(repo.consensus.find((item) => item.field === "epsBeat")).toMatchObject({ agreement: "disputed", value: null });
});
it("keeps an existing macro finding when a ticker-only run skips macro", () => {
  const repo = new MemoryScanRepository(new Set(["NVDA"]));
  const withMacro = scanSchema.parse({ ...base, macro: { ...base.macro, sectorRotationIntoGrowth: false, notes: "daily macro scan" } });
  repo.ingest(withMacro);
  const tickerOnly = scanSchema.parse({ ...base, runId: "6f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08" });
  repo.ingest(tickerOnly, { skipMacro: true });
  expect(repo.macroFindings).toHaveLength(1);
  expect(repo.macroFindings[0]).toMatchObject({ runId: withMacro.runId, supersededBy: null });
  expect(repo.findings.filter((item) => item.supersededBy === null).map((item) => item.runId)).toEqual([tickerOnly.runId]);
  const normal = scanSchema.parse({ ...base, runId: "7f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08" });
  repo.ingest(normal);
  expect(repo.macroFindings.map((item) => item.supersededBy)).toEqual([normal.runId, null]);
});
