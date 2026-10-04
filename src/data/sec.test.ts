import { expect, it } from "vitest";
import fixture from "./fixtures/sec-companyfacts.json";
import { revenueFromCompanyFacts } from "./sec";
it("uses comparable fiscal quarters and excludes year-to-date frames", () => {
  const result = revenueFromCompanyFacts(fixture, "2025-08-05");
  expect(result).toMatchObject({ revenueAccelerating: true, revenueDeclining: false, period: "Q2 FY2026" });
  expect(result?.currentGrowth).toBeCloseTo(50);
  expect(result?.priorGrowth).toBeCloseTo(20);
  expect(revenueFromCompanyFacts(fixture, "2025-07-01")).toBeNull();
  expect(revenueFromCompanyFacts(fixture, "2026-01-01")).toBeNull();
});
