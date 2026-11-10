import { expect, it } from "vitest";
import fixture from "./fixtures/sec-companyfacts.json";
import msft from "./fixtures/sec-msft-synthetic.json";
import crwd from "./fixtures/sec-crwd-synthetic.json";
import orcl from "./fixtures/sec-orcl-synthetic.json";
import { eodhdRevenueStored, revenueFromCompanyFacts, type CompanyFacts, type SecFact } from "./sec";

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

const halfRows = ([oldH1, oldH2, newH1, newH2]: number[]): SecFact[] =>
  ["2024-01-01|2024-06-30|2024-08-01", "2024-07-01|2024-12-31|2025-02-01",
    "2025-01-01|2025-06-30|2025-08-01", "2025-07-01|2025-12-31|2026-02-01"]
    .map((dates, index) => {
      const [start, end, filed] = dates.split("|");
      return { start, end, filed, val: [oldH1, oldH2, newH1, newH2][index],
        accn: `eodhd:${end}`, fy: Number(end.slice(0, 4)), fp: end.endsWith("06-30") ? "Q2" : "Q4", form: "EODHD" };
    });

const halfResult = (facts: SecFact[], asOf: string) =>
  revenueFromCompanyFacts({ facts: { "us-gaap": { Revenues: { units: { USD: facts } } } } }, asOf);

it("replays half-year scoring: quarter-only unknown becomes +4 revenue points for acceleration", () => {
  const facts = halfRows([100, 100, 110, 130]);
  const before = facts.filter((fact) => fact.start && (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000 <= 105);
  expect(halfResult(before, "2026-02-02")).toBeNull();
  const after = halfResult(facts, "2026-02-02");
  expect(after).toMatchObject({ period: "half ended 2025-12-31", revenueAccelerating: true, revenueDeclining: false });
  expect(after?.currentGrowth).toBeCloseTo(30);
  expect(after?.priorGrowth).toBeCloseTo(10);
  expect(Number(after?.revenueAccelerating) * 4).toBe(4);
});

it("a half-year decline is known, but missing comparatives stay unknown", () => {
  const facts = halfRows([100, 100, 110, 90]);
  expect(halfResult(facts, "2026-02-02")).toMatchObject({ revenueAccelerating: false, revenueDeclining: true });
  expect(halfResult(facts.slice(1), "2026-02-02")).toBeNull();
  expect(halfResult(facts.filter((fact) => fact.end !== "2025-06-30"), "2026-02-02")).toBeNull();
  expect(halfResult(facts, "2026-02-01")?.period).toBe("half ended 2025-12-31");
  expect(halfResult(facts, "2026-08-21")).toBeNull();
});

it("uses 200-day freshness for half-year rows and keeps 100 days for SEC quarters", () => {
  const facts = halfRows([100, 100, 110, 130]);
  const filed = Date.parse("2026-02-01T00:00:00Z");
  const at = (days: number) => new Date(filed + days * 86_400_000).toISOString().slice(0, 10);
  expect(halfResult(facts, at(200))).not.toBeNull();
  expect(halfResult(facts, at(201))).toBeNull();
  expect(revenueFromCompanyFacts(msft, "2027-01-01")).toBeNull();
});

it("stored half-year lookup retains the first-seen point-in-time gate and period label", async () => {
  const facts = halfRows([100, 100, 110, 130]);
  const db = { query: async <R>(sql: string, args: unknown[] = []) => {
    expect(sql).toContain("first_seen_at::date <= $3::date");
    return { rows: facts.filter((fact) => fact.filed <= String(args[2])).map((fact) => ({ unit: "GBP", period_start: fact.start,
      period_end: fact.end, value: String(fact.val), accession: fact.accn, fy: fact.fy, fp: fact.fp, filed: fact.filed })) as R[] };
  } };
  expect(await eodhdRevenueStored(db, "ZZH.LSE", "2026-02-02")).toMatchObject({ period: "half ended 2025-12-31", revenueAccelerating: true });
  expect(await eodhdRevenueStored(db, "ZZH.LSE", "2026-01-31")).toBeNull();
});
