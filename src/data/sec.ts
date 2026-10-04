/** SEC companyfacts revenue calculations. Only comparable filed fiscal quarters are used. */
export interface SecFact { start?: string; end: string; val: number; accn: string; fy: number; fp: string; form: string; filed: string; frame?: string }
export interface CompanyFacts { facts: { "us-gaap"?: Record<string, { units: Record<string, SecFact[]> }> } }
export interface RevenueResult { currentGrowth: number; priorGrowth: number; revenueAccelerating: boolean; revenueDeclining: boolean; period: string; source: string }
const concepts = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"];
function quarter(fact: SecFact) {
  if (!fact.start || !/^(Q[1-4])$/.test(fact.fp) || !["10-Q", "10-K"].includes(fact.form)) return false;
  const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000;
  return Number.isFinite(days) && days >= 70 && days <= 105;
}
export function revenueFromCompanyFacts(data: CompanyFacts, asOf: string): RevenueResult | null {
  const gaap = data.facts["us-gaap"] ?? {};
  const concept = concepts.find((name) => gaap[name]?.units?.USD?.some(quarter));
  if (!concept) return null;
  const facts = gaap[concept].units.USD.filter((f) => quarter(f) && f.form === "10-Q" && f.filed <= asOf && f.end <= asOf && Number.isFinite(f.val) && f.val > 0);
  // SEC fy/fp identify the filing focus. Comparative facts in that filing can
  // carry the same labels, so keep only its latest quarter-end duration fact.
  const byFiling = new Map<string, SecFact>();
  for (const fact of facts) {
    const old = byFiling.get(fact.accn);
    if (!old || old.end < fact.end) byFiling.set(fact.accn, fact);
  }
  const byPeriod = new Map<string, SecFact>();
  for (const fact of byFiling.values()) {
    const daysAfterEnd = (Date.parse(fact.filed) - Date.parse(fact.end)) / 86_400_000;
    if (daysAfterEnd < 0 || daysAfterEnd > 180) continue;
    const key = `${fact.fy}:${fact.fp}`;
    const old = byPeriod.get(key);
    if (!old || old.end < fact.end || (old.end === fact.end && old.filed < fact.filed)) byPeriod.set(key, fact);
  }
  const latest = [...byPeriod.values()].sort((a,b) => b.end.localeCompare(a.end))[0];
  if (!latest || (Date.parse(asOf) - Date.parse(latest.filed)) / 86_400_000 > 100) return null;
  const q = Number(latest.fp.slice(1));
  const priorQuarter = byPeriod.get(`${q === 1 ? latest.fy - 1 : latest.fy}:${q === 1 ? "Q4" : `Q${q-1}`}`);
  const yearAgo = byPeriod.get(`${latest.fy-1}:${latest.fp}`);
  const priorYearAgo = priorQuarter && byPeriod.get(`${priorQuarter.fy-1}:${priorQuarter.fp}`);
  if (!priorQuarter || !yearAgo || !priorYearAgo || priorQuarter.end >= latest.end || yearAgo.end >= latest.end) return null;
  const currentGrowth = (latest.val / yearAgo.val - 1) * 100;
  const priorGrowth = (priorQuarter.val / priorYearAgo.val - 1) * 100;
  return { currentGrowth, priorGrowth, revenueAccelerating: currentGrowth > priorGrowth, revenueDeclining: currentGrowth < 0, period: `${latest.fp} FY${latest.fy}`, source: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String((data as CompanyFacts & { cik?: number }).cik ?? "").padStart(10,"0")}.json` };
}
const cache = new Map<string, { day: string; value: unknown }>();
let previousRequest = 0;
async function secJson<T>(url: string): Promise<T> {
  const day = new Date().toISOString().slice(0,10);
  const saved = cache.get(url);
  if (saved?.day === day) return saved.value as T;
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) throw new Error("SEC_USER_AGENT is required");
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
