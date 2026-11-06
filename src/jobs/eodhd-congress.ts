import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import { assignTradeKeys, latestDisclosureDate, parseCongressTrades, upsertCongressTrades, type CongressTradeRow } from "../db/congress";
import { CallBudget, callsLoggedToday, isoDay, positiveInt, shiftDay, totalCalls } from "../db/economy-vendor";
import { runLoggedJob } from "./job-log";

export const CONGRESS_JOB = "eodhd-congress";
const PAGE = 100;
const COST = 10;
/** Disclosure windows are read oldest first and this many days long; a rerun starts this many days before the newest stored disclosure. */
const WINDOW_DAYS = 7;

export interface CongressArgs { dryRun: boolean; maxCalls: number; from?: string; initialDays: number }

export function parseCongressArgs(args: string[]): CongressArgs {
  const out: CongressArgs = { dryRun: false, maxCalls: 300, initialDays: 30 };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--dry-run") out.dryRun = true;
    else if (flag === "--max-calls") out.maxCalls = positiveInt(flag, args[++i]);
    else if (flag === "--initial-days") out.initialDays = positiveInt(flag, args[++i], 3650);
    else if (flag === "--from") { const day = isoDay(args[++i]); if (!day || day < "2012-01-01") throw new Error("--from needs a date from 2012-01-01"); out.from = day; }
    else throw new Error(`Unknown congress option ${flag}`);
  }
  if (out.maxCalls < COST) throw new Error(`--max-calls must allow one ${COST}-call page`);
  return out;
}

export type CongressClient = Pick<EodhdClient, "congressionalTrades" | "getCallCosts">;

/** Seven-day disclosure windows from `from` to `today`, oldest first. */
export function disclosureWindows(from: string, today: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let start = from; start <= today; start = shiftDay(start, WINDOW_DAYS)) {
    const end = shiftDay(start, WINDOW_DAYS - 1);
    out.push({ from: start, to: end < today ? end : today });
  }
  return out;
}

/**
 * Incremental by disclosure date. Each window is paged to its end before the next starts, so a capped run leaves no gap:
 * the next run restarts one window before the newest stored disclosure. Trade dates after today are excluded, as the vendor
 * reference advises, because mistyped future years sort first.
 */
export async function runCongress(db: Pick<pg.Pool, "query"> | null, api: CongressClient | null, options: CongressArgs, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const latest = db ? await latestDisclosureDate(db) : null;
  const from = options.from ?? (latest ? shiftDay(latest, -WINDOW_DAYS) : shiftDay(today, -options.initialDays));
  const windows = disclosureWindows(from, today);
  const counts = { from, windows: windows.length, requests: 0, fetched: 0, written: 0, skippedRows: 0, failedRequests: 0, capped: false as boolean, windowsDone: 0 };
  if (!options.dryRun && (!api || !db)) throw new Error("A live congress run needs DATABASE_URL and EODHD_API_KEY");
  if (options.dryRun || !api || !db) return { ...counts, dryRun: true, estimatedMinCalls: windows.length * COST, failures: 0, calls: 0 };
  const budget = new CallBudget(options.maxCalls, await callsLoggedToday(db, CONGRESS_JOB));
  const rows: CongressTradeRow[] = [];
  try {
    windows: for (const window of windows) {
      for (let offset = 0; ; offset += PAGE) {
        if (!budget.allow(COST)) break windows;
        counts.requests++;
        let page;
        try {
          page = parseCongressTrades(await api.congressionalTrades({ disclosureDateFrom: window.from, disclosureDateTo: window.to, transactionDateTo: today, offset, limit: PAGE }));
        } catch (error) {
          counts.failedRequests++;
          const reason = error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "error";
          process.stderr.write(`${JSON.stringify({ event: "eodhd_congress_request_failed", window: window.from, offset, reason })}\n`);
          break windows;
        }
        counts.skippedRows += page.skipped;
        counts.fetched += page.rows.length;
        rows.push(...page.rows);
        if (!page.hasNext || page.rows.length + page.skipped < PAGE) break;
      }
      counts.windowsDone++;
    }
    counts.written = await upsertCongressTrades(db, assignTradeKeys(rows));
  } finally {
    const calls = totalCalls(api.getCallCosts());
    if (calls > 0) await logEodhdCalls(db, CONGRESS_JOB, calls);
  }
  counts.capped = budget.capped;
  return { ...counts, dryRun: false, estimatedMinCalls: windows.length * COST, failures: counts.failedRequests + counts.skippedRows, calls: totalCalls(api.getCallCosts()) };
}

if (process.argv[1]?.endsWith("eodhd-congress.ts") || process.argv[1]?.endsWith("eodhd-congress.js")) {
  const options = parseCongressArgs(process.argv.slice(2));
  const db = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  void runLoggedJob(CONGRESS_JOB, async () => {
    try {
      const result = await runCongress(db, options.dryRun ? null : new EodhdClient(), options);
      if (result.failedRequests) process.exitCode = 1;
      return result;
    } finally { await db?.end(); }
  }, options.dryRun ? { store: null } : {});
}
