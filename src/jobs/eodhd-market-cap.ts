import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import { marketCapSubjects, parseMarketCap, saveMarketCap, type MarketCapSubject } from "../db/market-cap";
import { runLoggedJob } from "./job-log";

/** One /historical-market-cap request is billed as 10 calls (vendor documentation). */
export const MARKET_CAP_CALLS = 10;
const DAY = 86_400_000;
export interface MarketCapArgs { dryRun: boolean; maxSymbols: number; staleDays: number; only?: string[] }

export function parseMarketCapArgs(args: string[]): MarketCapArgs {
  const out: MarketCapArgs = { dryRun: false, maxSymbols: 80, staleDays: 28 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--max-symbols") out.maxSymbols = Number(args[++i]);
    else if (args[i] === "--stale-days") out.staleDays = Number(args[++i]);
    else if (args[i] === "--only") out.only = (args[++i] ?? "").split(",").map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
    else throw new Error(`Unknown market-cap option ${args[i]}`);
  }
  if (!Number.isInteger(out.maxSymbols) || out.maxSymbols < 1 || out.maxSymbols > 200) throw new Error("--max-symbols needs 1..200");
  if (!Number.isInteger(out.staleDays) || out.staleDays < 1 || out.staleDays > 365) throw new Error("--stale-days needs 1..365");
  return out;
}

/** Due when never attempted or last attempted at least `staleDays` before `today`. */
export function marketCapDue(subject: Pick<MarketCapSubject, "attemptedAt">, today: string, staleDays: number): boolean {
  if (!subject.attemptedAt) return true;
  return subject.attemptedAt.slice(0, 10) <= new Date(Date.parse(`${today}T00:00:00Z`) - staleDays * DAY).toISOString().slice(0, 10);
}

type Db = Pick<pg.Pool, "query">;
type Api = Pick<EodhdClient, "historicalMarketCap" | "getCallCosts">;

/**
 * Refreshes weekly market cap for due US universe names, oldest attempt first, at most `maxSymbols` per run
 * (10 calls each). A refresh asks from the latest stored week so a revised last point is replaced.
 */
export async function runMarketCap(db: Db, api: Api | null, options: MarketCapArgs, today = new Date().toISOString().slice(0, 10)) {
  const subjects = await marketCapSubjects(db, options.only);
  const due = subjects.filter((subject) => marketCapDue(subject, today, options.staleDays));
  const batch = due.slice(0, options.maxSymbols);
  let refreshed = 0, points = 0;
  const failures: string[] = [];
  const spent = () => api?.getCallCosts()["historical-market-cap"] ?? 0;
  try {
    if (!options.dryRun && api) for (const subject of batch) {
      try {
        const series = parseMarketCap(await api.historicalMarketCap(subject.vendorSymbol, subject.latestWeek ? { from: subject.latestWeek, to: today } : { to: today }));
        points += await saveMarketCap(db, subject, series);
        refreshed++;
      } catch (error) {
        failures.push(subject.ticker);
        await saveMarketCap(db, subject, null);
        if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) break;
      }
    }
  } finally {
    if (spent() > 0) await logEodhdCalls(db, "eodhd-market-cap", spent());
  }
  return { subjects: subjects.length, due: due.length, batch: batch.length, estimatedCalls: batch.length * MARKET_CAP_CALLS, refreshed, points, failures: failures.length, failedTickers: failures.join(","), calls: spent() };
}

if (process.argv[1]?.endsWith("eodhd-market-cap.ts") || process.argv[1]?.endsWith("eodhd-market-cap.js")) {
  const options = parseMarketCapArgs(process.argv.slice(2));
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runLoggedJob("eodhd-market-cap", async () => {
    try { const result = await runMarketCap(db, options.dryRun ? null : new EodhdClient(), options); if (result.failures) process.exitCode = 1; return result; }
    finally { await db.end(); }
  }, options.dryRun ? { store: null } : {});
}
