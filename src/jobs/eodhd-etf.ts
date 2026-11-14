import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls, upsertAssetBars } from "../db/asset-bars";
import {
  countActiveEtfs, dueEtfs, etfTrackingCandidates, markEtfFetched, parseEtfData, storeEtfDetail, syncEtfTracking, upsertEtfDividends,
} from "../db/etf-detail";
import { runLoggedJob } from "./job-log";

const DAY = 86_400_000;
const JOB = "eodhd-etf";
/** Billed calls per request: fundamentals 10, dividends 1, EOD 1 (fundamentals cost per the 2026-11-06 counter checks). */
export const ETF_COSTS = { fundamentals: 10, dividends: 1, eod: 1 } as const;
/** Same sections as the enrich run, so job and enrich rows for one as_of carry the same fields. */
export const ETF_DETAIL_FILTER = "General,ETF_Data,Technicals";

export interface EtfJobArgs { dryRun: boolean; maxTracked: number; maxCalls: number; backfill: number }
export function parseEtfJobArgs(args: string[], env: Record<string, string | undefined> = process.env): EtfJobArgs {
  const out: EtfJobArgs = { dryRun: false, maxTracked: 300, maxCalls: Number(env.ETF_EODHD_MAX_CALLS ?? 500), backfill: 5 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--max-tracked") out.maxTracked = Number(args[++i]);
    else if (args[i] === "--max-calls") out.maxCalls = Number(args[++i]);
    else if (args[i] === "--backfill") out.backfill = Number(args[++i]);
    else throw new Error(`Unknown eodhd-etf option ${args[i]}`);
  }
  if (!Number.isInteger(out.maxTracked) || out.maxTracked < 1 || out.maxTracked > 5000) throw new Error("--max-tracked needs 1..5000");
  if (!Number.isInteger(out.maxCalls) || out.maxCalls < 10 || out.maxCalls > 50_000) throw new Error("ETF_EODHD_MAX_CALLS (or --max-calls) needs 10..50000");
  if (!Number.isInteger(out.backfill) || out.backfill < 1 || out.backfill > 30) throw new Error("--backfill needs 1..30 years");
  return out;
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const yearsBack = (today: string, years: number) => new Date(Date.parse(`${today}T00:00:00Z`) - Math.round(years * 365.25) * DAY).toISOString().slice(0, 10);
const stopping = (error: unknown) => error instanceof EodhdHttpError && [401, 402, 403].includes(error.status);

type Api = Pick<EodhdClient, "fundamentals" | "dividends" | "eod" | "getCallCosts">;
type Db = Pick<pg.Pool, "query" | "connect">;

/**
 * Follows catalog ETFs: each run refreshes the stalest seventh of the tracked set (ETF_Data, dividends and new bars),
 * stopping before the call cap. Deferred listings stay due and come first next run.
 */
export async function runEtfJob(db: Db, api: Api | null, options: EtfJobArgs, today = new Date().toISOString().slice(0, 10)) {
  const candidates = await etfTrackingCandidates(db, options.maxTracked);
  const counts = { candidates: candidates.length, active: 0, deactivated: 0, due: 0, processed: 0, freshSkipped: 0, holdings: 0, exposure: 0, dividends: 0, bars: 0, deferred: 0, failures: 0, failedSymbols: "", cap: options.maxCalls, estimatedCalls: 0, calls: 0, dryRun: options.dryRun };
  if (options.dryRun || !api) {
    // Read-only: no tracking sync, no requests, no writes.
    const tracked = await countActiveEtfs(db);
    const slice = Math.ceil((tracked || candidates.length) / 7);
    const due = tracked ? await dueEtfs(db, slice) : [];
    counts.due = tracked ? due.length : slice;
    counts.estimatedCalls = Math.min(options.maxCalls, tracked
      ? due.reduce((sum, row) => sum + (row.detail_fresh ? 0 : ETF_COSTS.fundamentals) + ETF_COSTS.dividends + ETF_COSTS.eod, 0)
      : slice * (ETF_COSTS.fundamentals + ETF_COSTS.dividends + ETF_COSTS.eod));
    return counts;
  }
  const sync = await syncEtfTracking(db, candidates);
  counts.active = sync.active; counts.deactivated = sync.deactivated;
  const due = await dueEtfs(db, Math.max(1, Math.ceil(sync.active / 7)));
  counts.due = due.length;
  const failed: string[] = [];
  let spent = 0;
  try {
    for (const [index, fund] of due.entries()) {
      const need = (fund.detail_fresh ? 0 : ETF_COSTS.fundamentals) + ETF_COSTS.dividends + ETF_COSTS.eod;
      if (spent + need > options.maxCalls) { counts.deferred = due.length - index; break; }
      spent += need;
      try {
        let status: "ok" | "not_etf" | "isin_mismatch" = "ok";
        if (fund.detail_fresh) counts.freshSkipped++;
        else {
          const parsed = parseEtfData(await api.fundamentals<unknown>(fund.vendor_symbol, ETF_DETAIL_FILTER));
          if (!parsed || (parsed.type && parsed.type.toUpperCase() !== "ETF")) status = "not_etf";
          else if (fund.isin && parsed.isin && fund.isin !== parsed.isin) status = "isin_mismatch";
          else {
            const stored = await storeEtfDetail(db, { listingKey: fund.listing_key, vendorSymbol: fund.vendor_symbol, asOf: today, origin: "job", data: parsed, ucitsHint: fund.ucits_hint });
            counts.holdings += stored.holdings; counts.exposure += stored.exposure;
          }
        }
        if (status !== "ok") { await markEtfFetched(db, fund.listing_key, status, { dividends: false, bars: false }); counts.processed++; continue; }
        const dividendsFrom = fund.last_dividend_date ? nextDay(fund.last_dividend_date) : yearsBack(today, options.backfill);
        counts.dividends += await upsertEtfDividends(db, fund.vendor_symbol, await api.dividends(fund.vendor_symbol, { from: dividendsFrom, to: today }));
        const barsFrom = fund.last_bar_date ? nextDay(fund.last_bar_date) : yearsBack(today, options.backfill);
        if (barsFrom <= today) counts.bars += await upsertAssetBars(db, { vendor_symbol: fund.vendor_symbol, asset_class: "etf", currency: fund.currency, last_bar_date: fund.last_bar_date }, await api.eod(fund.vendor_symbol, { from: barsFrom, to: today }));
        await markEtfFetched(db, fund.listing_key, "ok", { dividends: true, bars: true });
        counts.processed++;
      } catch (error) {
        failed.push(fund.vendor_symbol);
        // A missing symbol would otherwise stay first in the queue every day.
        if (error instanceof EodhdHttpError && error.status === 404) await markEtfFetched(db, fund.listing_key, "failed", { dividends: false, bars: false });
        if (stopping(error)) { counts.deferred = due.length - index - 1; break; }
      }
    }
  } finally {
    const costs = api.getCallCosts();
    counts.calls = (costs.fundamentals ?? 0) + (costs.dividends ?? 0) + (costs.eod ?? 0);
    if (counts.calls > 0) await logEodhdCalls(db, JOB, counts.calls);
  }
  counts.estimatedCalls = spent;
  counts.failures = failed.length;
  counts.failedSymbols = failed.slice(0, 20).join(",");
  return counts;
}

if (process.argv[1]?.endsWith("eodhd-etf.ts") || process.argv[1]?.endsWith("eodhd-etf.js")) {
  const options = parseEtfJobArgs(process.argv.slice(2));
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runLoggedJob(JOB, async () => {
    try { const result = await runEtfJob(db, options.dryRun ? null : new EodhdClient(), options); if (result.failures) process.exitCode = 1; return result; }
    finally { await db.end(); }
  }, options.dryRun ? { store: null } : {});
}
