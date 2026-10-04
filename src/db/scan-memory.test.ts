import { expect, it } from "vitest";
import { scanSchema } from "../data/scan";
import { MemoryScanRepository } from "./scan-memory";
const base = {
  schemaVersion: 1, runId: "3f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08", asOf: "2026-10-03", generatedAt: "2026-10-04T05:30:00Z", runner: { name: "test", model: "test" },
  tickers: [{ symbol: "NVDA", fundamentals: { revenueAccelerating: true, revenueDeclining: null, epsBeat: null, guidanceRaised: null, guidanceCut: null, productCatalyst: null, insiderOrInstitutionalBuying: null, narrativeChanged: null }, evidence: [], confidence: "high" }],
  macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "", evidence: [], events: [] },
};
it("keeps unsupported claims, replays run IDs, and supersedes same-day findings", () => {
  const repo = new MemoryScanRepository(new Set(["NVDA"]));
  const first = scanSchema.parse(base);
  expect(repo.ingest(first)).toEqual({ accepted: 1, rejected: [], replayed: false });
  expect(repo.latest("NVDA")?.evidence.flags["fundamentals.revenueAccelerating"]).toBe(false);
  expect(repo.ingest(first).replayed).toBe(true);
  const second = scanSchema.parse({ ...base, runId: "4f2b8c1e-5a47-4d0e-9b61-2c7e4a9d1f08", tickers: [{ ...base.tickers[0], evidence: [{ claim: "fundamentals.revenueAccelerating", url: "https://example.com/results" }] }] });
  repo.ingest(second);
  expect(repo.findings[0].supersededBy).toBe(second.runId);
  expect(repo.latest("NVDA")?.evidence.flags["fundamentals.revenueAccelerating"]).toBe(true);
});
