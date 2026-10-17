import type { CollectedDocument } from "../types";
import type { SourceHttp } from "./client";
import { isoDate, LICENSES, parseJson, PING_REQUEST, round, runPing, sourceDocument, type PendingFact, type PingResult, type SourceContext, type SourceOutput, type Env } from "./common";
import { loadTickers, universeByCik } from "./sec";
import { defaultHttp } from "./client";

/** Revenue concepts in priority order. A filer uses the first one that has every quarter we need. */
export const REVENUE_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
] as const;
/** Ignore filers below this quarterly revenue in the ranking (USD). */
export const MIN_REVENUE = 50_000_000;
export const DISCOVERY_SIZE = 25;
const FILING_LAG_DAYS = 45;

export interface Quarter { year: number; q: 1 | 2 | 3 | 4 }
export const label = (quarter: Quarter) => `CY${quarter.year}Q${quarter.q}`;
export const frameUrl = (concept: string, quarter: Quarter) => `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/USD/${label(quarter)}.json`;
export const shift = (quarter: Quarter, by: number): Quarter => {
  const index = quarter.year * 4 + (quarter.q - 1) + by;
  return { year: Math.floor(index / 4), q: ((index % 4) + 1) as Quarter["q"] };
};
export const quarterEnd = (quarter: Quarter) => isoDate(new Date(Date.UTC(quarter.year, quarter.q * 3, 0)));
/** Latest calendar quarter that ended at least FILING_LAG_DAYS before `now`. */
export function latestQuarter(now: Date): Quarter {
  let quarter: Quarter = { year: now.getUTCFullYear(), q: (Math.floor(now.getUTCMonth() / 3) + 1) as Quarter["q"] };
  while (Date.parse(`${quarterEnd(quarter)}T00:00:00Z`) + FILING_LAG_DAYS * 86400000 > now.getTime()) quarter = shift(quarter, -1);
  return quarter;
}

export interface FrameValue { value: number; end: string; name: string }
export function parseFrame(text: string): Map<number, FrameValue> {
  const frame = parseJson<{ data?: { cik: number; entityName?: string; end: string; val: number }[] }>(text, "SEC frames");
  if (!Array.isArray(frame.data)) throw new Error("SEC frames: no data array");
  const out = new Map<number, FrameValue>();
  for (const row of frame.data) if (Number.isFinite(row.val) && Number.isInteger(row.cik)) out.set(row.cik, { value: row.val, end: row.end, name: row.entityName ?? "" });
  return out;
}

export interface Growth {
  cik: number; name: string; concept: string; end: string; revenue: number;
  yoyPercent: number; qoqPercent: number; priorYoyPercent: number; accelerationPp: number;
}
/** Growth needs the latest quarter, the one before it, and both a year earlier. Anything missing or not positive is skipped. */
export function computeGrowth(byConcept: Map<string, Map<string, Map<number, FrameValue>>>, quarter: Quarter): Growth[] {
  const wanted = [quarter, shift(quarter, -1), shift(quarter, -4), shift(quarter, -5)].map(label);
  const ciks = new Set<number>();
  for (const frames of byConcept.values()) for (const rows of frames.values()) for (const cik of rows.keys()) ciks.add(cik);
  const out: Growth[] = [];
  for (const cik of ciks) {
    for (const concept of REVENUE_CONCEPTS) {
      const rows = wanted.map((name) => byConcept.get(concept)?.get(name)?.get(cik));
      if (rows.some((row) => !row)) continue;
      const [now, previous, yearAgo, previousYearAgo] = rows as FrameValue[];
      if (![now, previous, yearAgo, previousYearAgo].every((row) => row.value > 0)) break;
      const yoy = now.value / yearAgo.value - 1, priorYoy = previous.value / previousYearAgo.value - 1;
      out.push({ cik, name: now.name, concept, end: now.end, revenue: now.value, yoyPercent: round(yoy * 100), qoqPercent: round((now.value / previous.value - 1) * 100),
        priorYoyPercent: round(priorYoy * 100), accelerationPp: round((yoy - priorYoy) * 100) });
      break;
    }
  }
  return out;
}

const money = (value: number) => value >= 1e9 ? `$${round(value / 1e9)}B` : `$${round(value / 1e6)}M`;
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
const line = (growth: Growth) => `revenue ${money(growth.revenue)}, YoY ${signed(growth.yoyPercent)}%, prior-quarter YoY ${signed(growth.priorYoyPercent)}%, acceleration ${signed(growth.accelerationPp)} pp, QoQ ${signed(growth.qoqPercent)}%`;

/** The SEC returns 404 for a concept with no filers in a quarter (SalesRevenueNet was retired). That is an empty frame, not a failed source. */
export async function fetchFrame(ctx: SourceContext, concept: string, quarter: Quarter) {
  try { return parseFrame(await ctx.http.get(frameUrl(concept, quarter), { maxBytes: 60 * 1024 * 1024 })); }
  catch (error) {
    if (error instanceof Error && /^HTTP 404 at /.test(error.message)) return new Map<number, FrameValue>();
    throw error;
  }
}

export async function collectFrames(ctx: SourceContext): Promise<SourceOutput> {
  const quarter = latestQuarter(ctx.now);
  const labels = [quarter, shift(quarter, -1), shift(quarter, -4), shift(quarter, -5)];
  const byConcept = new Map<string, Map<string, Map<number, FrameValue>>>();
  for (const concept of REVENUE_CONCEPTS) {
    const frames = new Map<string, Map<number, FrameValue>>();
    for (const wanted of labels) frames.set(label(wanted), await fetchFrame(ctx, concept, wanted));
    byConcept.set(concept, frames);
  }
  const tickers = await loadTickers(ctx.http);
  const universe = universeByCik(ctx.companies, tickers);
  const growth = computeGrowth(byConcept, quarter);
  const eligible = growth.filter((row) => row.revenue >= MIN_REVENUE && row.yoyPercent > 0 && (tickers.byCik.has(row.cik) || universe.has(row.cik)))
    .sort((a, b) => b.accelerationPp - a.accelerationPp || b.revenue - a.revenue);
  const rank = new Map(eligible.map((row, index) => [row.cik, index + 1]));
  const base = frameUrl(REVENUE_CONCEPTS[0], quarter);
  const documents: CollectedDocument[] = [], facts: PendingFact[] = [];

  const discovery = eligible.filter((row) => !universe.has(row.cik)).slice(0, DISCOVERY_SIZE);
  const items = discovery.map((row) => ({ rank: rank.get(row.cik)!, ticker: tickers.byCik.get(row.cik)?.ticker ?? null, ...row }));
  documents.push(sourceDocument({ source: "sec-frames", symbol: null, docType: "revenue acceleration ranking", url: `${base}#discovery-${label(quarter)}`,
    publishedAt: `${quarterEnd(quarter)}T00:00:00Z`,
    body: `Top ${items.length} accelerating revenue growers outside the universe, ${label(quarter)}, of ${eligible.length} filers with revenue of at least ${money(MIN_REVENUE)}. ` +
      items.map((item) => `${item.rank}. ${item.ticker ?? `CIK ${item.cik}`} ${item.name}: ${line(item)}.`).join(" "),
    meta: { kind: "discovery", quarter: label(quarter), eligible: eligible.length, items: items.map((item) => ({ rank: item.rank, ticker: item.ticker, cik: item.cik, name: item.name, concept: item.concept, revenue: item.revenue, yoyPercent: item.yoyPercent, qoqPercent: item.qoqPercent, priorYoyPercent: item.priorYoyPercent, accelerationPp: item.accelerationPp })) } }, LICENSES.sec));

  for (const row of growth) {
    const symbol = universe.get(row.cik);
    if (!symbol || !ctx.symbols.includes(symbol)) continue;
    const url = `${base}#${symbol}-${label(quarter)}`;
    documents.push(sourceDocument({ source: "sec-frames", symbol, docType: "XBRL revenue growth", url, publishedAt: `${row.end}T00:00:00Z`,
      body: `${symbol} ${row.name} ${label(quarter)} (quarter ended ${row.end}), us-gaap ${row.concept}: ${line(row)}.${rank.has(row.cik) ? ` Acceleration rank ${rank.get(row.cik)} of ${eligible.length}.` : ""}`,
      meta: { kind: "universe", quarter: label(quarter), concept: row.concept, cik: row.cik, rank: rank.get(row.cik) ?? null, eligible: eligible.length } }, LICENSES.sec));
    facts.push({ symbol, key: "revenue_growth_quarterly", asOf: row.end, documentUrls: [url],
      value: { quarter: label(quarter), concept: row.concept, revenue: row.revenue, yoyPercent: row.yoyPercent, qoqPercent: row.qoqPercent, priorYoyPercent: row.priorYoyPercent, accelerationPp: row.accelerationPp, rank: rank.get(row.cik) ?? null, eligible: eligible.length } });
  }
  return { documents, facts };
}

export const ping = (http: SourceHttp = defaultHttp(), env: Env = process.env): Promise<PingResult> => runPing("frames", async () => {
  const quarter = latestQuarter(new Date());
  const rows = parseFrame(await http.get(frameUrl(REVENUE_CONCEPTS[0], shift(quarter, -1)), { ...PING_REQUEST, maxBytes: 60 * 1024 * 1024 }));
  if (rows.size < 100) throw new Error(`only ${rows.size} filers in frame`);
  return `${rows.size} filers in ${label(shift(quarter, -1))}`;
}, { sec: true, env });
