import { expect, it } from "vitest";
import fixture from "./fixtures/sec-companyfacts.json";
import msft from "./fixtures/sec-msft-synthetic.json";
import crwd from "./fixtures/sec-crwd-synthetic.json";
import orcl from "./fixtures/sec-orcl-synthetic.json";
import { revenueFromCompanyFacts, type CompanyFacts, type SecFact } from "./sec";

function copy(data: CompanyFacts): CompanyFacts {
  return structuredClone(data);
}

function revenueFacts(data: CompanyFacts): SecFact[] {
  return Object.values(data.facts["us-gaap"] ?? {})[0].units.USD;
}

it("uses comparable fiscal quarters and excludes year-to-date frames", () => {
  const result = revenueFromCompanyFacts(fixture, "2025-08-05");
  expect(result).toMatchObject({ revenueAccelerating: true, revenueDeclining: false, period: "Q2 FY2026" });
  expect(result?.currentGrowth).toBeCloseTo(50);
  expect(result?.priorGrowth).toBeCloseTo(20);
  expect(revenueFromCompanyFacts(fixture, "2025-07-01")).toBeNull();
  expect(revenueFromCompanyFacts(fixture, "2026-01-01")).toBeNull();
});

it("derives June fiscal Q4 from three standalone quarters", () => {
  const result = revenueFromCompanyFacts(msft, "2026-10-09");
  expect(result).toMatchObject({ period: "Q4 FY2026", revenueAccelerating: true, revenueDeclining: false });
  expect(result?.currentGrowth).toBeCloseTo((300 / 180 - 1) * 100);
  expect(result?.priorGrowth).toBeCloseTo((220 / 140 - 1) * 100);
  expect(result?.detail).toContain("Q4 FY2026 derived from 10-K (FY minus Q1–Q3)");
});

it("derives January fiscal Q4 from nine-month YTD when standalone quarters are missing", () => {
  const result = revenueFromCompanyFacts(crwd, "2026-03-25");
  expect(result).toMatchObject({ period: "Q4 FY2026", revenueAccelerating: true });
  expect(result?.detail).toContain("Q4 FY2026 derived from 10-K (FY minus 9M)");
  expect(result?.currentGrowth).toBeCloseTo((300 / 180 - 1) * 100);
});

it("uses a derived May fiscal Q4 to compare the next Q1", () => {
  const result = revenueFromCompanyFacts(orcl, "2026-10-09");
  expect(result).toMatchObject({ period: "Q1 FY2027", revenueAccelerating: false });
  expect(result?.detail).toContain("Q4 FY2026 derived from 10-K");
  expect(result?.detail).toContain("Q4 FY2025 derived from 10-K");
});

it("leaves Q4 unknown when an interim part is missing", () => {
  const data = copy(msft);
  const facts = revenueFacts(data);
  const concept = Object.values(data.facts["us-gaap"] ?? {})[0];
  concept.units.USD = facts.filter((fact) => !(fact.fy === 2026 && (fact.fp === "Q2" || fact.fp === "Q3" && fact.val === 520)));
  expect(revenueFromCompanyFacts(data, "2026-10-09")).toBeNull();
});

it("does not subtract facts with mismatched units", () => {
  const data = copy(msft);
  const concept = Object.values(data.facts["us-gaap"] ?? {})[0];
  const annual = concept.units.USD.find((fact) => fact.fy === 2026 && fact.fp === "FY")!;
  concept.units.USD = concept.units.USD.filter((fact) => fact !== annual);
  concept.units.EUR = [annual];
  expect(revenueFromCompanyFacts(data, "2026-10-09")).toBeNull();
});

it("uses the latest filed annual restatement available on the as-of date", () => {
  const data = copy(msft);
  const facts = revenueFacts(data);
  const annual = facts.find((fact) => fact.fy === 2026 && fact.fp === "FY")!;
  facts.push({ ...annual, accn: "msft-2026-fy-restated", filed: "2026-09-01", val: 900 });
  expect(revenueFromCompanyFacts(data, "2026-08-25")?.currentGrowth).toBeCloseTo((300 / 180 - 1) * 100);
  expect(revenueFromCompanyFacts(data, "2026-10-09")?.currentGrowth).toBeCloseTo((380 / 180 - 1) * 100);
});

it("falls back to a complete revenue concept and retains 100-day freshness", () => {
  const fallback = copy(orcl);
  fallback.facts["us-gaap"]!.RevenueFromContractWithCustomerIncludingAssessedTax = fallback.facts["us-gaap"]!.Revenues;
  fallback.facts["us-gaap"]!.Revenues = { units: { USD: [revenueFacts(orcl)[0]] } };
  expect(revenueFromCompanyFacts(fallback, "2026-10-09")?.period).toBe("Q1 FY2027");
  expect(revenueFromCompanyFacts(msft, "2027-01-01")).toBeNull();
});
