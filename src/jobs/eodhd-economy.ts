import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import {
  indicatorFetchedAt, parseEconomicEvents, parseMacroIndicator, parseUstRates, replaceEconomicEvents, upsertMacroIndicators, upsertUstRates,
  UST_CURVES, type UstCurve,
} from "../db/economy";
import { CallBudget, callsLoggedToday, list, positiveInt, shiftDay, totalCalls } from "../db/economy-vendor";
import { runLoggedJob } from "./job-log";

export const ECONOMY_JOB = "eodhd-economy";
/** Vendor limit per economic-events request; a full page may be truncated, so it is stored without pruning. */
const EVENTS_LIMIT = 1000;
const COST = { events: 1, ust: 1, indicator: 10 } as const;

export type EconomyPart = "events" | "ust" | "indicators";
export interface EconomyArgs {
  parts: EconomyPart[]; dryRun: boolean; maxCalls: number; countries: string[]; indicatorCountries: string[]; indicators: string[];
  daysBack: number; daysAhead: number; maxAgeDays: number;
}

export const DEFAULT_EVENT_COUNTRIES = ["US", "DE", "FR", "GB", "JP", "CN", "SK", "CZ"];
export const DEFAULT_INDICATOR_COUNTRIES = ["USA", "DEU", "FRA", "GBR", "JPN", "CHN", "SVK", "CZE"];
export const DEFAULT_INDICATORS = ["gdp_growth_annual", "inflation_consumer_prices_annual", "unemployment_total_percent", "debt_percent_gdp", "gdp_per_capita_usd"];

export function parseEconomyArgs(args: string[]): EconomyArgs {
  const out: EconomyArgs = { parts: ["events", "ust", "indicators"], dryRun: false, maxCalls: 600, countries: DEFAULT_EVENT_COUNTRIES,
    indicatorCountries: DEFAULT_INDICATOR_COUNTRIES, indicators: DEFAULT_INDICATORS, daysBack: 14, daysAhead: 30, maxAgeDays: 25 };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--dry-run") out.dryRun = true;
    else if (flag === "--part") {
      const value = args[++i];
      if (value === "all") out.parts = ["events", "ust", "indicators"];
      else if (value === "events" || value === "ust" || value === "indicators") out.parts = [value];
      else throw new Error("--part needs events|ust|indicators|all");
    }
    else if (flag === "--max-calls") out.maxCalls = positiveInt(flag, args[++i]);
    else if (flag === "--countries") out.countries = list(args[++i]).map((code) => code.toUpperCase());
    else if (flag === "--indicator-countries") out.indicatorCountries = list(args[++i]).map((code) => code.toUpperCase());
    else if (flag === "--indicators") out.indicators = list(args[++i]);
    else if (flag === "--days-back") out.daysBack = positiveInt(flag, args[++i], 90);
    else if (flag === "--days-ahead") out.daysAhead = positiveInt(flag, args[++i], 120);
    else if (flag === "--max-age-days") out.maxAgeDays = positiveInt(flag, args[++i], 366);
    else throw new Error(`Unknown economy option ${flag}`);
  }
  if (out.countries.some((code) => !/^[A-Z]{2}$/.test(code))) throw new Error("--countries needs ISO 3166 alpha-2 codes");
  if (out.indicatorCountries.some((code) => !/^[A-Z]{3}$/.test(code))) throw new Error("--indicator-countries needs ISO 3166 alpha-3 codes");
  if (out.indicators.some((name) => !/^[a-z_]+$/.test(name))) throw new Error("--indicators needs vendor indicator keys");
  return out;
}

export type EconomyClient = Pick<EodhdClient, "economicEvents" | "ustRates" | "macroIndicator" | "getCallCosts">;
type Db = Pick<pg.Pool, "query" | "connect">;

/** Treasury years to read: the current year, plus the previous one during the first week of January. */
export const ustYears = (today: string) => {
  const year = Number(today.slice(0, 4));
  return today.slice(5) <= "01-07" ? [year - 1, year] : [year];
};

export async function runEconomy(db: Db | null, api: EconomyClient | null, options: EconomyArgs, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const from = shiftDay(today, -options.daysBack), to = shiftDay(today, options.daysAhead);
  const fresh = options.parts.includes("indicators") && db ? await indicatorFetchedAt(db) : new Map<string, string>();
  const cutoff = now.getTime() - options.maxAgeDays * 86_400_000;
  const duePairs = options.parts.includes("indicators") ? options.indicatorCountries.flatMap((country) => options.indicators
    .filter((indicator) => { const last = fresh.get(`${country}|${indicator}`); return !last || Date.parse(last) < cutoff; })
    .map((indicator) => ({ country, indicator }))) : [];
  const ustPlan = options.parts.includes("ust") ? UST_CURVES.flatMap((curve) => ustYears(today).map((year) => ({ curve, year }))) : [];
  const eventPlan = options.parts.includes("events") ? options.countries : [];
  const estimatedCalls = eventPlan.length * COST.events + ustPlan.length * COST.ust + duePairs.length * COST.indicator;
  const counts = { requests: 0, events: 0, eventsRemoved: 0, ustRows: 0, indicatorRows: 0, skippedRows: 0, failedRequests: 0, truncated: 0, capped: false as boolean };
  if (!options.dryRun && (!api || !db)) throw new Error("A live economy run needs DATABASE_URL and EODHD_API_KEY");
  if (options.dryRun || !api || !db) {
    return { ...counts, dryRun: true, plannedRequests: eventPlan.length + ustPlan.length + duePairs.length, estimatedCalls, failures: 0, calls: 0 };
  }
  const budget = new CallBudget(options.maxCalls, await callsLoggedToday(db, ECONOMY_JOB));
  const failed: string[] = [];
  let stop = false;
  const attempt = async (label: string, cost: number, work: () => Promise<void>) => {
    if (stop) return;
    if (!budget.allow(cost)) { stop = true; return; }
    counts.requests++;
    try { await work(); } catch (error) {
      counts.failedRequests++;
      failed.push(label);
      const reason = error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "error";
      process.stderr.write(`${JSON.stringify({ event: "eodhd_economy_request_failed", request: label, reason })}\n`);
      if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) stop = true;
    }
  };
  try {
    for (const country of eventPlan) await attempt(`events:${country}`, COST.events, async () => {
      const payload = await api.economicEvents({ country, from, to, limit: EVENTS_LIMIT });
      const parsed = parseEconomicEvents(payload);
      counts.skippedRows += parsed.skipped;
      const rows = parsed.rows.filter((row) => row.country === country);
      if (!rows.length) return;
      const truncated = Array.isArray(payload) && payload.length >= EVENTS_LIMIT;
      if (truncated) counts.truncated++;
      const client = await db.connect();
      try {
        const result = await replaceEconomicEvents(client, country, from, to, rows, !truncated);
        counts.events += result.written; counts.eventsRemoved += result.removed;
      } finally { client.release(); }
    });
    for (const { curve, year } of ustPlan) await attempt(`ust:${curve}:${year}`, COST.ust, async () => {
      const parsed = parseUstRates(curve as UstCurve, await api.ustRates(curve, year));
      counts.skippedRows += parsed.skipped;
      counts.ustRows += await upsertUstRates(db, parsed.rows);
    });
    for (const { country, indicator } of duePairs) await attempt(`indicator:${country}:${indicator}`, COST.indicator, async () => {
      const parsed = parseMacroIndicator(country, indicator, await api.macroIndicator(country, indicator));
      counts.skippedRows += parsed.skipped;
      counts.indicatorRows += await upsertMacroIndicators(db, parsed.rows);
    });
  } finally {
    const calls = totalCalls(api.getCallCosts());
    if (calls > 0) await logEodhdCalls(db, ECONOMY_JOB, calls);
  }
  counts.capped = budget.capped;
  return { ...counts, dryRun: false, plannedRequests: eventPlan.length + ustPlan.length + duePairs.length, estimatedCalls,
    failures: counts.failedRequests + counts.skippedRows, failedRequestsList: failed.join(","), calls: totalCalls(api.getCallCosts()) };
}

if (process.argv[1]?.endsWith("eodhd-economy.ts") || process.argv[1]?.endsWith("eodhd-economy.js")) {
  const options = parseEconomyArgs(process.argv.slice(2));
  const db = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  void runLoggedJob(ECONOMY_JOB, async () => {
    try {
      const result = await runEconomy(db, options.dryRun ? null : new EodhdClient(), options);
      if (result.failedRequests) process.exitCode = 1;
      return result;
    } finally { await db?.end(); }
  }, options.dryRun ? { store: null } : {});
}
