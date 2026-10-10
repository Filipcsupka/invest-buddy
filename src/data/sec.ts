import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { REVENUE_CONCEPTS } from "../collectors/sources/frames";

/** SEC companyfacts revenue calculations. Only comparable filed fiscal quarters are used. */
export interface SecFact { start?: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string }
export interface CompanyFacts { facts: { "us-gaap"?: Record<string, { units: Record<string, SecFact[]> }> } }
export interface RevenueResult { currentGrowth: number; priorGrowth: number; revenueAccelerating: boolean; revenueDeclining: boolean; period: string; source: string; detail?: string }
type RevenueQuarter = SecFact & { derived?: "fy-minus-quarters" | "fy-minus-9m" };
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const duration = (fact: SecFact) => fact.start ? day(fact.end) - day(fact.start) : NaN;
const valid = (fact: SecFact, asOf: string) => fact.filed <= asOf && fact.end <= asOf && Number.isFinite(fact.val) && fact.val > 0 &&
  Number.isInteger(fact.fy) && Number.isFinite(day(fact.end)) && Number.isFinite(day(fact.filed));
const fiscalQuarter = (fact: SecFact) => /^Q[1-4]$/.test(fact.fp) && ["10-Q", "10-K"].includes(fact.form) && duration(fact) >= 70 && duration(fact) <= 105;
const annual = (fact: SecFact) => fact.form === "10-K" && fact.fp === "FY" && duration(fact) >= 350 && duration(fact) <= 380;
const nineMonths = (fact: SecFact) => fact.form === "10-Q" && fact.fp === "Q3" && duration(fact) >= 250 && duration(fact) <= 300;

function latestByFiling(facts: SecFact[], kind: (fact: SecFact) => boolean): SecFact[] {
  const byFiling = new Map<string, SecFact>();
  for (const fact of facts.filter(kind)) {
    // A filing also contains comparatives with its focus labels. Its latest
    // period end is the one described by fy/fp.
    const old = byFiling.get(fact.accn);
    if (!old || old.end < fact.end) byFiling.set(fact.accn, fact);
  }
  return [...byFiling.values()].filter((fact) => day(fact.filed) - day(fact.end) >= 0 && day(fact.filed) - day(fact.end) <= 180);
}

function newer(fact: SecFact, old?: SecFact) {
  return !old || fact.end > old.end || (fact.end === old.end && fact.filed > old.filed);
}

function quarters(facts: SecFact[], asOf: string): Map<string, RevenueQuarter> {
  const eligible = facts.filter((fact) => valid(fact, asOf));
  const byPeriod = new Map<string, RevenueQuarter>();
  for (const fact of latestByFiling(eligible, (item) => fiscalQuarter(item) && item.form === "10-Q")) {
    const key = `${fact.fy}:${fact.fp}`;
    if (newer(fact, byPeriod.get(key))) byPeriod.set(key, fact);
  }
  const years = new Map<number, SecFact>();
  for (const fact of latestByFiling(eligible, annual)) if (newer(fact, years.get(fact.fy))) years.set(fact.fy, fact);
  const ytd = new Map<number, SecFact>();
  for (const fact of latestByFiling(eligible, nineMonths)) if (newer(fact, ytd.get(fact.fy))) ytd.set(fact.fy, fact);

  for (const [fy, fullYear] of years) {
    const key = `${fy}:Q4`;
    if (byPeriod.has(key)) continue;
    const q3 = byPeriod.get(`${fy}:Q3`);
    const nine = ytd.get(fy);
    const matchingNine = nine && nine.start === fullYear.start && (!q3 || nine.end === q3.end);
    const interimEnd = q3?.end ?? (matchingNine ? nine.end : undefined);
    const q4Days = interimEnd ? day(fullYear.end) - day(interimEnd) : NaN;
    if (!interimEnd || q4Days < 70 || q4Days > 105) continue;
    const q1 = byPeriod.get(`${fy}:Q1`), q2 = byPeriod.get(`${fy}:Q2`);
    const contiguous = q1 && q2 && q3 && q1.start === fullYear.start && day(q2.start!) === day(q1.end) + 1 &&
      day(q3.start!) === day(q2.end) + 1;
    const firstThree = contiguous ? q1.val + q2.val + q3.val : matchingNine ? nine.val : null;
    if (firstThree === null || fullYear.val - firstThree <= 0) continue;
    byPeriod.set(key, { ...fullYear, start: new Date((day(interimEnd) + 1) * 86_400_000).toISOString().slice(0, 10),
      fp: "Q4", val: fullYear.val - firstThree, derived: contiguous ? "fy-minus-quarters" : "fy-minus-9m" });
  }
  return byPeriod;
}

export function revenueFromCompanyFacts(data: CompanyFacts, asOf: string): RevenueResult | null {
  const gaap = data.facts["us-gaap"] ?? {};
  for (const concept of REVENUE_CONCEPTS) {
    // Each calculation stays within one GAAP concept and one SEC unit.
    const facts = gaap[concept]?.units?.USD;
    if (!facts) continue;
    const byPeriod = quarters(facts, asOf);
    const latest = [...byPeriod.values()].sort((a, b) => b.end.localeCompare(a.end))[0];
    if (!latest || day(asOf) - day(latest.filed) > 100) continue;
    const q = Number(latest.fp.slice(1));
    const priorQuarter = byPeriod.get(`${q === 1 ? latest.fy - 1 : latest.fy}:${q === 1 ? "Q4" : `Q${q - 1}`}`);
    const yearAgo = byPeriod.get(`${latest.fy - 1}:${latest.fp}`);
    const priorYearAgo = priorQuarter && byPeriod.get(`${priorQuarter.fy - 1}:${priorQuarter.fp}`);
    if (!priorQuarter || !yearAgo || !priorYearAgo || priorQuarter.end >= latest.end || yearAgo.end >= latest.end) continue;
    const currentGrowth = (latest.val / yearAgo.val - 1) * 100;
    const priorGrowth = (priorQuarter.val / priorYearAgo.val - 1) * 100;
    const derived = [latest, priorQuarter, yearAgo, priorYearAgo].filter((fact) => fact.derived)
      .map((fact) => `${fact.fp} FY${fact.fy} derived from 10-K (${fact.derived === "fy-minus-9m" ? "FY minus 9M" : "FY minus Q1–Q3"})`);
    return { currentGrowth, priorGrowth, revenueAccelerating: currentGrowth > priorGrowth, revenueDeclining: currentGrowth < 0,
      period: `${latest.fp} FY${latest.fy}`, source: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String((data as CompanyFacts & { cik?: number }).cik ?? "").padStart(10, "0")}.json`,
      ...(derived.length ? { detail: [...new Set(derived)].join("; ") } : {}) };
  }
  return null;
}
const cache = new Map<string, { day: string; value: unknown }>();
let previousRequest = 0;
async function secJson<T>(url: string): Promise<T> {
  const day = new Date().toISOString().slice(0,10);
  const saved = cache.get(url);
  if (saved?.day === day) return saved.value as T;
  const userAgent = requireSecUserAgent(process.env.SEC_USER_AGENT);
  const wait = Math.max(0, 250 - (Date.now() - previousRequest));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  previousRequest = Date.now();
  const response = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`SEC HTTP ${response.status}`);
  const value = await response.json() as T;
  cache.set(url, { day, value });
  return value;
}
export async function secRevenue(symbol: string, asOf: string): Promise<RevenueResult | null> {
  const tickers = await secJson<Record<string, { ticker: string; cik_str: number }>>("https://www.sec.gov/files/company_tickers.json");
  const company = Object.values(tickers).find((entry) => entry.ticker.toUpperCase() === symbol.toUpperCase());
  if (!company) return null;
  const cik = String(company.cik_str).padStart(10,"0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = await secJson<CompanyFacts>(url);
  const result = revenueFromCompanyFacts(facts, asOf);
  return result ? { ...result, source: url } : null;
}
