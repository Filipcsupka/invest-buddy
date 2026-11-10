/**
 * Builds src/components/welcome/sec-facts.json for the Welcome page section "Real filings, plain numbers".
 *
 * Source: SEC EDGAR XBRL companyfacts (https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json). US government data, public
 * domain. The SEC asks for a declared User-Agent with a contact address and at most 10 requests per second; this script sends
 * SEC_USER_AGENT from the environment and waits a little over a second between companies.
 *
 * What it keeps per company: the latest annual revenue reported on a 10-K, the prior year's figure as reported in that same filing
 * (so restatements follow the newest report), the year-over-year change, the period, the form, the filing date and links to the
 * filing and to the API document. No score, no state, no opinion.
 *
 * Run: SEC_USER_AGENT="Name contact@example.com" npx tsx scripts/welcome-sec-facts.ts
 */
import { writeFileSync } from "node:fs";
import { requireSecUserAgent } from "../src/collectors/sec-user-agent";

export interface Company { ticker: string; name: string; cik: number }

/** Well-known US companies outside the sample universe and outside src/data/fixtures.ts, so no real name sits near a sample score. */
export const COMPANIES: readonly Company[] = [
  { ticker: "WMT", name: "Walmart", cik: 104169 },
  { ticker: "COST", name: "Costco Wholesale", cik: 909832 },
  { ticker: "KO", name: "Coca-Cola", cik: 21344 },
  { ticker: "NFLX", name: "Netflix", cik: 1065280 },
  { ticker: "V", name: "Visa", cik: 1403161 },
  { ticker: "MCD", name: "McDonald's", cik: 63908 },
  { ticker: "JNJ", name: "Johnson & Johnson", cik: 200406 },
  { ticker: "PG", name: "Procter & Gamble", cik: 80424 },
];

/** Revenue concepts in the order companies most often use them for total revenue. */
export const REVENUE_CONCEPTS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"] as const;

export interface FactUnit { start?: string; end: string; val: number; accn: string; fy?: number; fp?: string; form: string; filed: string }
export interface CompanyFacts { cik?: number; entityName?: string; facts?: { "us-gaap"?: Record<string, { units?: Record<string, FactUnit[]> }> } }

export interface RevenueFact {
  concept: string;
  revenueUsd: number;
  priorRevenueUsd: number;
  yoyPercent: number;
  periodStart: string;
  periodEnd: string;
  priorPeriodEnd: string;
  fiscalYear: number | null;
  form: string;
  filed: string;
  accession: string;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;
/** A fiscal year is 52 or 53 weeks; allow a little either side. */
const isAnnual = (f: FactUnit) => !!f.start && days(f.start, f.end) >= 350 && days(f.start, f.end) <= 380;
const isTenK = (f: FactUnit) => f.form === "10-K" || f.form === "10-K/A";
const latestFiled = (a: FactUnit, b: FactUnit) => (b.filed > a.filed ? b : a);

/** Latest annual revenue with its prior year for one concept, or null when the concept has no usable pair. */
export function annualRevenue(facts: CompanyFacts, concept: string): RevenueFact | null {
  const rows = (facts.facts?.["us-gaap"]?.[concept]?.units?.USD ?? []).filter((f) => isAnnual(f) && isTenK(f) && Number.isFinite(f.val) && f.val > 0);
  if (!rows.length) return null;
  const end = rows.reduce((max, f) => (f.end > max ? f.end : max), rows[0]!.end);
  const current = rows.filter((f) => f.end === end).reduce(latestFiled);
  // The prior year as the newest filing reports it: same accession first, otherwise the latest filing for that period.
  const priorRows = rows.filter((f) => { const gap = days(f.end, end); return gap >= 350 && gap <= 380; });
  if (!priorRows.length) return null;
  const prior = priorRows.find((f) => f.accn === current.accn) ?? priorRows.reduce(latestFiled);
  return {
    concept,
    revenueUsd: current.val,
    priorRevenueUsd: prior.val,
    yoyPercent: Math.round(((current.val - prior.val) / prior.val) * 1000) / 10,
    periodStart: current.start!,
    periodEnd: end,
    priorPeriodEnd: prior.end,
    fiscalYear: current.fy ?? null,
    form: current.form,
    filed: current.filed,
    accession: current.accn,
  };
}

/** Picks the concept with the most recent annual period; on a tie, the larger figure (total revenue rather than a sub-line). */
export function latestAnnualRevenue(facts: CompanyFacts): RevenueFact | null {
  const found = REVENUE_CONCEPTS.map((concept) => annualRevenue(facts, concept)).filter((f): f is RevenueFact => f !== null);
  if (!found.length) return null;
  return found.reduce((best, f) => (f.periodEnd > best.periodEnd || (f.periodEnd === best.periodEnd && f.revenueUsd > best.revenueUsd) ? f : best));
}

export const pad = (cik: number) => String(cik).padStart(10, "0");
export const factsUrl = (cik: number) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`;
export const filingUrl = (cik: number, accession: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${accession}-index.htm`;

export interface SecFactsFile {
  source: string;
  licence: string;
  accessed: string;
  note: string;
  companies: (Company & RevenueFact & { filingUrl: string; sourceUrl: string })[];
}

export function buildFile(rows: { company: Company; fact: RevenueFact }[], accessed: string): SecFactsFile {
  return {
    source: "SEC EDGAR XBRL companyfacts API",
    licence: "US government data, public domain (SEC EDGAR). Figures as reported by each company in its annual report on Form 10-K.",
    accessed,
    note: "Generated by scripts/welcome-sec-facts.ts. Re-run to refresh; the page shows the accessed date.",
    companies: rows.map(({ company, fact }) => ({ ...company, ...fact, filingUrl: filingUrl(company.cik, fact.accession), sourceUrl: factsUrl(company.cik) })),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const agent = requireSecUserAgent(process.env.SEC_USER_AGENT);
  const rows: { company: Company; fact: RevenueFact }[] = [];
  for (const [i, company] of COMPANIES.entries()) {
    if (i) await sleep(1100);
    const res = await fetch(factsUrl(company.cik), { headers: { "User-Agent": agent, Accept: "application/json" } });
    // SEC answers a rate or User-Agent block with 403; stop rather than retry into it.
    if (!res.ok) throw new Error(`${company.ticker}: SEC answered ${res.status}`);
    const fact = latestAnnualRevenue((await res.json()) as CompanyFacts);
    if (!fact) throw new Error(`${company.ticker}: no annual revenue pair found`);
    rows.push({ company, fact });
    console.log(`${company.ticker.padEnd(6)} ${fact.periodEnd} ${fact.concept} ${fact.revenueUsd} (${fact.yoyPercent > 0 ? "+" : ""}${fact.yoyPercent}%) ${fact.form} filed ${fact.filed}`);
  }
  const file = buildFile(rows, new Date().toISOString().slice(0, 10));
  writeFileSync("src/components/welcome/sec-facts.json", `${JSON.stringify(file, null, 2)}\n`);
  console.log(`wrote ${rows.length} companies to src/components/welcome/sec-facts.json`);
}

if (process.argv[1]?.endsWith("welcome-sec-facts.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
