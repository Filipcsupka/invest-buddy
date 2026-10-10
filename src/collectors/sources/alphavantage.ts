import { EPS_FACT_KEY, type EpsSurpriseFact } from "../../data/eps";
import { CapReached } from "../../data/usage";
import { freshnessDays } from "../../data/evidence";
import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { isDate, isoDate, LICENSES, marketTicker, parseJson, PING_REQUEST, runPing, sourceDocument, type PendingFact, type PingResult, type SourceContext, type SourceOutput } from "./common";

export const SOURCE = "alphavantage";
export const AV_QUERY = "https://www.alphavantage.co/query";
/** The free key allows 25 requests a day. Stay below that in one run and across all runs of one UTC day. */
export const MAX_REQUESTS_PER_RUN = 20;
export const MAX_REQUESTS_PER_DAY = 20;
export const KEY_VARIABLE = "ALPHA_VANTAGE_API_KEY";

/** Request url. The only place the key appears; it is never stored, logged or returned. */
const requestUrl = (ticker: string, key: string) => `${AV_QUERY}?function=EARNINGS&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`;
/** Stored document url: the request without the key, one per symbol and report date. */
export const documentUrl = (ticker: string, reportedDate: string) => `${AV_QUERY}?function=EARNINGS&symbol=${encodeURIComponent(ticker)}#${reportedDate}`;
/** Removes the key from any text before it leaves this module. */
export const redact = (text: string, key: string | undefined) => key ? text.split(key).join("[redacted]").split(encodeURIComponent(key)).join("[redacted]") : text;
const startOfUtcDay = (now: Date) => `${isoDate(now)}T00:00:00.000Z`;
const addDays = (date: string, days: number) => isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));

/** Alpha Vantage answers HTTP 200 with one of these keys for a limit or a bad call. A limit message means the day is used up. */
export class AlphaVantageLimit extends Error {}
interface QuarterRow { fiscalDateEnding?: string; reportedDate?: string; reportedEPS?: string; estimatedEPS?: string; surprise?: string; surprisePercentage?: string }
const num = (value: unknown): number | null => {
  if (typeof value !== "string" || value.trim() === "" || value === "None") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Newest quarter with a reported EPS, reported on or before `today`. undefined when the answer has none. */
export function parseEarnings(text: string, today: string): EpsSurpriseFact | undefined {
  const answer = parseJson<{ quarterlyEarnings?: QuarterRow[]; Information?: string; Note?: string; "Error Message"?: string }>(text, "Alpha Vantage");
  if (answer.Information || answer.Note) throw new AlphaVantageLimit(`Alpha Vantage: ${answer.Information ?? answer.Note}`);
  if (answer["Error Message"]) throw new Error(`Alpha Vantage: ${answer["Error Message"]}`);
  if (!Array.isArray(answer.quarterlyEarnings)) throw new Error("Alpha Vantage: no quarterlyEarnings array");
  const rows = answer.quarterlyEarnings
    .filter((row) => isDate(row.reportedDate) && row.reportedDate <= today && num(row.reportedEPS) !== null)
    .sort((a, b) => b.reportedDate!.localeCompare(a.reportedDate!));
  const row = rows[0];
  if (!row) return undefined;
  return { reportedDate: row.reportedDate!, fiscalDateEnding: isDate(row.fiscalDateEnding) ? row.fiscalDateEnding : null,
    reportedEps: num(row.reportedEPS), estimatedEps: num(row.estimatedEPS), surprisePercent: num(row.surprisePercentage) };
}

/** Missing first, then the oldest stored report date, then symbol. */
export function pickSymbols(symbols: string[], latest: Map<string, string>, budget: number): string[] {
  return [...symbols].sort((a, b) => (latest.get(a) ?? "").localeCompare(latest.get(b) ?? "") || a.localeCompare(b)).slice(0, Math.max(0, budget));
}

/**
 * One EARNINGS request per symbol, at most MAX_REQUESTS_PER_RUN per run and MAX_REQUESTS_PER_DAY per UTC day (counted from
 * collector_runs.api_requests). No key: nothing is sent. Each request is a single attempt, so the count is the number of calls.
 * A limit answer or 429 stops the run. The source never throws after the first request, so the usage is always recorded.
 */
export async function collectAlphaVantage(ctx: SourceContext): Promise<SourceOutput> {
  const key = ctx.env[KEY_VARIABLE]?.trim();
  if (!key) return { documents: [], facts: [], apiRequests: 0, skipped: `${KEY_VARIABLE} is not set` };
  if (!ctx.state) throw new Error("alphavantage needs stored state to enforce the daily request cap");
  const used = await ctx.state.apiRequestsSince(SOURCE, startOfUtcDay(ctx.now));
  const budget = Math.min(MAX_REQUESTS_PER_RUN, MAX_REQUESTS_PER_DAY - used);
  if (budget <= 0) return { documents: [], facts: [], apiRequests: 0, skipped: `daily cap of ${MAX_REQUESTS_PER_DAY} requests reached (${used} used today)` };
  const picked = pickSymbols(ctx.symbols, await ctx.state.latestFactDates(EPS_FACT_KEY), budget);
  const today = isoDate(ctx.now);
  const documents: CollectedDocument[] = [], facts: PendingFact[] = [], failures: { ticker: string; reason: string }[] = [];
  let requests = 0;
  for (const [index, symbol] of picked.entries()) {
    const ticker = marketTicker(symbol);
    let quarter: EpsSurpriseFact | undefined;
    try {
      await ctx.usage?.reserve(SOURCE, 1, { job: "collect", credits: 1 });
      requests++;
      quarter = parseEarnings(await ctx.http.get(requestUrl(ticker, key), { timeoutMs: 15_000, maxAttempts: 1 }), today);
    } catch (error) {
      const reason = redact(error instanceof Error ? error.message : String(error), key);
      failures.push({ ticker: symbol, reason });
      if (error instanceof AlphaVantageLimit || error instanceof CapReached || /HTTP 429/.test(reason)) {
        for (const rest of picked.slice(index + 1)) failures.push({ ticker: rest, reason: "not fetched: Alpha Vantage limit" });
        break;
      }
      continue;
    }
    if (!quarter) { failures.push({ ticker: symbol, reason: "Alpha Vantage: no reported quarter" }); continue; }
    const url = documentUrl(ticker, quarter.reportedDate);
    const pct = quarter.surprisePercent === null ? "not given" : `${quarter.surprisePercent}%`;
    documents.push(sourceDocument({ source: SOURCE, symbol, docType: "EPS surprise", url, publishedAt: `${quarter.reportedDate}T00:00:00Z`,
      body: `${symbol} quarter ended ${quarter.fiscalDateEnding ?? "unknown"}, reported ${quarter.reportedDate}: reported EPS ${quarter.reportedEps ?? "not given"}, estimated EPS ${quarter.estimatedEps ?? "not given"}, surprise ${pct}. Alpha Vantage EARNINGS.`,
      meta: { fiscalDateEnding: quarter.fiscalDateEnding, ticker } }, LICENSES.alphavantage));
    // Keyed by the report date, so a weekly rerun of the same quarter does not add a row. It expires with the earnings window.
    facts.push({ symbol, key: EPS_FACT_KEY, asOf: quarter.reportedDate, documentUrls: [url], expiresAt: addDays(quarter.reportedDate, freshnessDays.epsBeat),
      value: { ...quarter, source: SOURCE, displayAllowed: false } });
  }
  return { documents, facts, apiRequests: requests, failures };
}

/** Uses the documented `demo` key (IBM only), so a ping never spends the daily quota of the real key. */
export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing(SOURCE, async () => {
  const quarter = parseEarnings(await http.get(requestUrl("IBM", "demo"), PING_REQUEST), isoDate(new Date()));
  if (!quarter) throw new Error("no reported quarter for IBM");
  return `IBM latest report ${quarter.reportedDate}`;
});
