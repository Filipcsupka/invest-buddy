import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { instruments } from "../src/data/fixtures";
import { COMPANIES, annualRevenue, buildFile, filingUrl, latestAnnualRevenue, type CompanyFacts, type FactUnit, type SecFactsFile } from "./welcome-sec-facts";

const unit = (start: string, end: string, val: number, accn: string, filed: string, form = "10-K"): FactUnit => ({ start, end, val, accn, filed, form, fp: "FY" });
const facts = (concepts: Record<string, FactUnit[]>): CompanyFacts => ({ facts: { "us-gaap": Object.fromEntries(Object.entries(concepts).map(([k, v]) => [k, { units: { USD: v } }])) } });

describe("latestAnnualRevenue", () => {
  it("takes the latest fiscal year from a 10-K and the prior year from the same filing", () => {
    const f = facts({
      Revenues: [
        unit("2023-01-01", "2023-12-31", 100, "0001-23-000001", "2024-02-01"),
        unit("2022-01-01", "2022-12-31", 80, "0001-23-000001", "2024-02-01"),
        unit("2024-01-01", "2024-12-31", 120, "0001-25-000002", "2025-02-01"),
        // The 2023 figure as restated in the 2024 report wins over the original.
        unit("2023-01-01", "2023-12-31", 96, "0001-25-000002", "2025-02-01"),
        // Quarters and a 10-Q are ignored.
        unit("2025-01-01", "2025-03-31", 40, "0001-25-000003", "2025-05-01", "10-Q"),
        unit("2024-10-01", "2024-12-31", 33, "0001-25-000002", "2025-02-01"),
      ],
    });
    const r = latestAnnualRevenue(f)!;
    expect(r).toMatchObject({ concept: "Revenues", revenueUsd: 120, priorRevenueUsd: 96, periodEnd: "2024-12-31", priorPeriodEnd: "2023-12-31", accession: "0001-25-000002", form: "10-K" });
    expect(r.yoyPercent).toBe(25);
  });

  it("handles 52/53-week fiscal years and a negative change", () => {
    const f = facts({ Revenues: [unit("2024-02-01", "2025-01-31", 90, "a", "2025-03-15"), unit("2023-02-01", "2024-02-02", 100, "a", "2025-03-15")] });
    expect(latestAnnualRevenue(f)!.yoyPercent).toBe(-10);
  });

  it("prefers the concept with the newest period, then the larger figure", () => {
    const old = [unit("2022-01-01", "2022-12-31", 500, "x", "2023-02-01"), unit("2021-01-01", "2021-12-31", 400, "x", "2023-02-01")];
    const fresh = [unit("2024-01-01", "2024-12-31", 300, "y", "2025-02-01"), unit("2023-01-01", "2023-12-31", 250, "y", "2025-02-01")];
    expect(latestAnnualRevenue(facts({ SalesRevenueNet: old, RevenueFromContractWithCustomerExcludingAssessedTax: fresh }))!.concept).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
    const subLine = [unit("2024-01-01", "2024-12-31", 280, "y", "2025-02-01"), unit("2023-01-01", "2023-12-31", 240, "y", "2025-02-01")];
    expect(latestAnnualRevenue(facts({ Revenues: fresh, RevenueFromContractWithCustomerExcludingAssessedTax: subLine }))!.revenueUsd).toBe(300);
  });

  it("returns null without a prior year or without annual rows", () => {
    expect(annualRevenue(facts({ Revenues: [unit("2024-01-01", "2024-12-31", 1, "a", "2025-01-01")] }), "Revenues")).toBeNull();
    expect(latestAnnualRevenue({})).toBeNull();
  });
});

it("links the filing index from the accession number", () => {
  expect(filingUrl(21344, "0000021344-25-000010")).toBe("https://www.sec.gov/Archives/edgar/data/21344/000002134425000010/0000021344-25-000010-index.htm");
  const file = buildFile([{ company: COMPANIES[0]!, fact: latestAnnualRevenue(facts({ Revenues: [unit("2024-01-01", "2024-12-31", 2, "0001-25-000002", "2025-02-01"), unit("2023-01-01", "2023-12-31", 1, "0001-25-000002", "2025-02-01")] }))! }], "2026-11-10");
  expect(file.companies[0]!.sourceUrl).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0000104169.json");
});

it("keeps the list apart from the sample universe and the fixture names", () => {
  const names = new Set(instruments.map((i) => i.name));
  const tickers = new Set(instruments.map((i) => i.ticker));
  expect(COMPANIES.length).toBeGreaterThanOrEqual(6);
  expect(COMPANIES.length).toBeLessThanOrEqual(8);
  for (const c of COMPANIES) {
    expect(tickers.has(c.ticker), c.ticker).toBe(false);
    for (const name of names) if (name.length > 3) expect(c.name.includes(name), `${c.name} contains ${name}`).toBe(false);
  }
});

it("ships a snapshot that matches the script's shape and cites SEC EDGAR", () => {
  const file = JSON.parse(readFileSync("src/components/welcome/sec-facts.json", "utf8")) as SecFactsFile;
  expect(file.source).toMatch(/SEC EDGAR/);
  expect(file.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(file.companies.length).toBeGreaterThanOrEqual(6);
  for (const c of file.companies) {
    expect(c.filingUrl).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\//);
    expect(c.sourceUrl).toMatch(/^https:\/\/data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK\d{10}\.json$/);
    expect(c.form).toMatch(/^10-K/);
    expect(c.revenueUsd).toBeGreaterThan(0);
    expect(Math.round(((c.revenueUsd - c.priorRevenueUsd) / c.priorRevenueUsd) * 1000) / 10).toBe(c.yoyPercent);
  }
});
