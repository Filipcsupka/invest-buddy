import pg from "pg";
import { EodhdClient, EodhdHttpError, type BulkLastDayBar, type EodBar, type Split } from "../data-providers/eodhd/client";
import { logEodhdCalls, upsertAssetBars } from "../db/asset-bars";
import {
  countActiveEtfs, dueEtfs, etfTrackingCandidates, markEtfFetched, parseEtfData, storeEtfDetail, syncEtfTracking, upsertEtfDividends,
  type DueEtf, type EtfDueMode,
} from "../db/etf-detail";
import { runLoggedJob } from "./job-log";

const DAY = 86_400_000;
export const ETF_COSTS = { fundamentals: 10, dividends: 1, eod: 1, splits: 1, bulk: 100 } as const;
/** Account-wide default: the 100,000-call plan minus room for EODHD jobs that do not write eodhd_call_log. */
export const ACCOUNT_DAILY_BUDGET = 70_000;
export const ETF_DETAIL_FILTER = "General,ETF_Data,Technicals";
export interface EtfJobArgs { mode: EtfDueMode; dryRun: boolean; maxTracked: number; maxCalls: number; accountBudget: number; backfill: number; limit: number }
export function parseEtfJobArgs(args: string[], env: Record<string, string | undefined> = process.env): EtfJobArgs {
  const out: EtfJobArgs = { mode: "bars", dryRun: false, maxTracked: Number(env.ETF_MAX_TRACKED ?? 0), maxCalls: Number(env.ETF_EODHD_MAX_CALLS ?? 10_000),
    accountBudget: Number(env.EODHD_ACCOUNT_DAILY_BUDGET ?? ACCOUNT_DAILY_BUDGET), backfill: 5, limit: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--mode") out.mode = args[++i] as EtfDueMode;
    else if (args[i] === "--max-tracked") out.maxTracked = Number(args[++i]);
    else if (args[i] === "--max-calls") out.maxCalls = Number(args[++i]);
    else if (args[i] === "--backfill") out.backfill = Number(args[++i]);
    else if (args[i] === "--limit") out.limit = Number(args[++i]);
    else throw new Error(`Unknown eodhd-etf option ${args[i]}`);
  }
  if (!["bars", "backfill", "dividends", "fundamentals"].includes(out.mode)) throw new Error("--mode needs bars, backfill, dividends or fundamentals");
  if (!Number.isInteger(out.maxTracked) || out.maxTracked < 0 || out.maxTracked > 100_000) throw new Error("ETF_MAX_TRACKED (or --max-tracked) needs 0..100000; 0 means all");
  if (!Number.isInteger(out.maxCalls) || out.maxCalls < 1 || out.maxCalls > 90_000) throw new Error("ETF_EODHD_MAX_CALLS (or --max-calls) needs 1..90000");
  if (!Number.isInteger(out.accountBudget) || out.accountBudget < 1 || out.accountBudget > 100_000) throw new Error("EODHD_ACCOUNT_DAILY_BUDGET needs 1..100000");
  if (!Number.isInteger(out.backfill) || out.backfill < 1 || out.backfill > 30) throw new Error("--backfill needs 1..30 years");
  if (!Number.isInteger(out.limit) || out.limit < 0 || out.limit > 100_000) throw new Error("--limit needs 0..100000; 0 means all");
  return out;
}
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const daysBack = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);
/** True when a weekday lies strictly between the stored bar and the bulk bar, so the bulk file alone would leave a gap. */
export function missedWeekday(last: string | null, date: string): boolean {
  if (!last) return false;
  for (let day = nextDay(last), n = 0; day < date; day = nextDay(day), n++) {
    if (n > 7) return true;
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return true;
  }
  return false;
}
/** job_runs and eodhd_call_log name; bars keeps the original job name. */
export const etfJobName = (mode: EtfDueMode) => (mode === "bars" ? "eodhd-etf" : `eodhd-etf-${mode}`);
/** Bars cost per exchange: the bulk file at 100 funds or more, otherwise one request per fund. */
const barsCost = (due: DueEtf[]) => {
  const sizes = new Map<string, number>();
  for (const fund of due) sizes.set(fund.exchange, (sizes.get(fund.exchange) ?? 0) + 1);
  return [...sizes.values()].reduce((sum, n) => sum + Math.min(n, ETF_COSTS.bulk), 0);
};
/** A one-day close move of 1.4x either way is treated as a possible split. Leveraged and inverse funds are out of scope. */
export const SPLIT_JUMP = 1.4;
export function suspectSplit(previousClose: number | null, rows: Pick<EodBar, "date" | "close">[]): boolean {
  let last = previousClose;
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!(typeof row.close === "number" && row.close > 0)) continue;
    if (last && (row.close / last >= SPLIT_JUMP || last / row.close >= SPLIT_JUMP)) return true;
    last = row.close;
  }
  return false;
}
const splitRatio = (split: Split) => {
  const match = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(split.split ?? "");
  const ratio = match ? Number(match[1]) / Number(match[2]) : NaN;
  return /^\d{4}-\d{2}-\d{2}$/.test(split.date) && Number.isFinite(ratio) && ratio > 0 && ratio !== 1 ? ratio : null;
};
/**
 * Divides prices before each split date by the split ratio ("new/old"), so the stored ETF series has no split jump.
 * EODHD already reports volume adjusted for later splits.
 */
export function splitAdjust(rows: EodBar[], splits: Split[]): EodBar[] {
  const valid = splits.map((split) => ({ date: split.date, ratio: splitRatio(split) })).filter((split): split is { date: string; ratio: number } => split.ratio !== null);
  return rows.map((row) => {
    const factor = valid.filter((split) => split.date > row.date).reduce((product, split) => product * split.ratio, 1);
    if (factor === 1) return row;
    const scale = (value: number | null | undefined) => (typeof value === "number" ? value / factor : value);
    return { ...row, open: scale(row.open), high: scale(row.high), low: scale(row.low), close: scale(row.close) } as EodBar;
  });
}
const yearsBack = (today: string, years: number) => new Date(Date.parse(`${today}T00:00:00Z`) - Math.round(years * 365.25) * DAY).toISOString().slice(0, 10);
const stopping = (error: unknown) => error instanceof EodhdHttpError && [401, 402, 403, 429].includes(error.status);
type Api = Pick<EodhdClient, "fundamentals" | "dividends" | "eod" | "splits" | "getCallCosts"> & { eodBulkLastDay(exchange: string): Promise<BulkLastDayBar[]> };
type Db = Pick<pg.Pool, "query" | "connect">;
const spentCalls = (api: Api) => Object.values(api.getCallCosts()).reduce((sum, calls) => sum + calls, 0);
const asset = (fund: DueEtf) => ({ vendor_symbol: fund.vendor_symbol, asset_class: "etf" as const, currency: fund.currency, last_bar_date: fund.last_bar_date });
const code = (symbol: string) => symbol.slice(0, symbol.lastIndexOf("."));

async function callsToday(db: Pick<pg.Pool, "query">): Promise<number> {
  const result = await db.query<{ calls: string | null }>("SELECT sum(calls)::text AS calls FROM eodhd_call_log WHERE run_date=CURRENT_DATE", []);
  return Number(result.rows[0]?.calls ?? 0);
}

/** Synchronize the in-scope universe, then run one independently budgeted collection mode. */
export async function runEtfJob(db: Db, api: Api | null, options: EtfJobArgs, today = new Date().toISOString().slice(0, 10)) {
  const candidates = await etfTrackingCandidates(db, options.maxTracked);
  const counts = { mode: options.mode, candidates: candidates.length, active: 0, deactivated: 0, due: 0, processed: 0, freshSkipped: 0,
    holdings: 0, exposure: 0, dividends: 0, bars: 0, bulkExchanges: 0, splitChecks: 0, splitAdjusted: 0, empty: 0, deferred: 0, failures: 0, failedSymbols: "",
    cap: options.maxCalls, accountCallsToday: 0, estimatedCalls: 0, calls: 0, dryRun: options.dryRun };
  // eodhd_call_log holds today's logged calls from every job; the run never takes the account past its daily budget.
  counts.accountCallsToday = await callsToday(db);
  counts.cap = Math.max(0, Math.min(options.maxCalls, options.accountBudget - counts.accountCallsToday));
  if (options.dryRun || !api) {
    const tracked = await countActiveEtfs(db);
    const due = tracked ? await dueEtfs(db, options.mode, options.limit) : [];
    counts.due = tracked ? due.length : candidates.length;
    counts.estimatedCalls = options.mode === "bars" ? Math.min(counts.cap, barsCost(due))
      : Math.min(counts.cap, counts.due * (options.mode === "fundamentals" ? ETF_COSTS.fundamentals : ETF_COSTS.eod));
    return counts;
  }
  const sync = await syncEtfTracking(db, candidates, options.maxTracked === 0);
  counts.active = sync.active; counts.deactivated = sync.deactivated;
  const due = await dueEtfs(db, options.mode, options.limit);
  counts.due = due.length;
  const failed: string[] = [];
  const room = (cost: number) => spentCalls(api) + cost <= counts.cap;
  /**
   * Bars that jump by a split-sized move trigger a splits request. When the vendor confirms a split after the stored
   * bars, the symbol's history is fetched again and every stored price is restated on the post-split basis.
   */
  const storeBars = async (fund: DueEtf, rows: EodBar[], history: boolean) => {
    if (rows.length && suspectSplit(fund.last_close, rows) && room(ETF_COSTS.splits + (history ? 0 : ETF_COSTS.eod))) {
      const from = yearsBack(today, options.backfill);
      counts.splitChecks++;
      const splits = (await api.splits(fund.vendor_symbol, { from, to: today })).filter((split) => splitRatio(split) !== null);
      const fresh = history ? splits : splits.filter((split) => !fund.last_bar_date || split.date > fund.last_bar_date);
      if (fresh.length) {
        counts.splitAdjusted++;
        rows = splitAdjust(history ? rows : await api.eod(fund.vendor_symbol, { from, to: today }), splits);
      }
    }
    return upsertAssetBars(db, asset(fund), rows);
  };
  try {
    if (options.mode === "bars") {
      const groups = new Map<string, DueEtf[]>();
      for (const fund of due) groups.set(fund.exchange, [...(groups.get(fund.exchange) ?? []), fund]);
      let visited = 0;
      // One symbol request (1 call) fills a gap or a fund missing from the bulk file.
      const single = async (fund: DueEtf) => {
        const from = fund.last_bar_date ? nextDay(fund.last_bar_date) : daysBack(today, 14);
        return from > today ? 0 : storeBars(fund, await api.eod(fund.vendor_symbol, { from, to: today }), false);
      };
      exchanges: for (const [exchange, funds] of groups) {
        let byCode: Map<string, BulkLastDayBar> | null = null;
        // Below 100 funds, per-symbol requests cost less than the 100-call bulk file.
        if (funds.length >= ETF_COSTS.bulk) {
          if (!room(ETF_COSTS.bulk)) { counts.deferred = due.length - visited; break; }
          try {
            const rows = await api.eodBulkLastDay(exchange);
            if (!Array.isArray(rows)) throw new Error(`Invalid ETF bulk response for ${exchange}`);
            counts.bulkExchanges++;
            byCode = new Map();
            for (const row of rows) if (row.code && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) byCode.set(row.code, row);
          } catch (error) {
            failed.push(exchange); visited += funds.length;
            if (stopping(error)) { counts.deferred = due.length - visited; break; }
            continue;
          }
        }
        for (const fund of funds) {
          const bar = byCode?.get(code(fund.vendor_symbol));
          const perSymbol = !bar || missedWeekday(fund.last_bar_date, bar.date);
          if (perSymbol && !room(ETF_COSTS.eod)) { counts.deferred = due.length - visited; break exchanges; }
          try {
            if (perSymbol) counts.bars += await single(fund);
            else if (!fund.last_bar_date || bar.date > fund.last_bar_date) counts.bars += await storeBars(fund, [bar], false);
            counts.processed++;
          } catch (error) {
            failed.push(fund.vendor_symbol);
            if (stopping(error)) { counts.deferred = due.length - visited - 1; break exchanges; }
          }
          visited++;
        }
      }
    } else {
      for (const [index, fund] of due.entries()) {
        const cost = options.mode === "fundamentals" ? (fund.detail_fresh ? 0 : ETF_COSTS.fundamentals) : ETF_COSTS.eod;
        if (!room(cost)) { counts.deferred = due.length - index; break; }
        try {
          if (options.mode === "fundamentals") {
            if (fund.detail_fresh) counts.freshSkipped++;
            else {
              const parsed = parseEtfData(await api.fundamentals<unknown>(fund.vendor_symbol, ETF_DETAIL_FILTER));
              if (!parsed || (parsed.type && parsed.type.toUpperCase() !== "ETF")) { await markEtfFetched(db, fund.listing_key, "fundamentals", "not_etf"); counts.processed++; continue; }
              if (fund.isin && parsed.isin && fund.isin !== parsed.isin) { await markEtfFetched(db, fund.listing_key, "fundamentals", "isin_mismatch"); counts.processed++; continue; }
              const stored = await storeEtfDetail(db, { listingKey: fund.listing_key, vendorSymbol: fund.vendor_symbol, asOf: today, origin: "job", data: parsed, ucitsHint: fund.ucits_hint });
              counts.holdings += stored.holdings; counts.exposure += stored.exposure;
            }
            await markEtfFetched(db, fund.listing_key, "fundamentals");
          } else if (options.mode === "dividends") {
            const from = fund.last_dividend_date ? nextDay(fund.last_dividend_date) : yearsBack(today, options.backfill);
            counts.dividends += await upsertEtfDividends(db, fund.vendor_symbol, await api.dividends(fund.vendor_symbol, { from, to: today }));
            await markEtfFetched(db, fund.listing_key, "dividends");
          } else {
            // bars_fetched_at is set only after a successful history request. Daily bulk bars never consume this queue.
            // An empty answer waits seven days (bars_retry_after) so it does not head every later chunk.
            const saved = await storeBars({ ...fund, last_close: null }, await api.eod(fund.vendor_symbol, { from: yearsBack(today, options.backfill), to: today }), true);
            if (!saved) { counts.empty++; await markEtfFetched(db, fund.listing_key, "backfill", "failed"); continue; }
            counts.bars += saved;
            await markEtfFetched(db, fund.listing_key, "backfill");
          }
          counts.processed++;
        } catch (error) {
          failed.push(fund.vendor_symbol);
          if (error instanceof EodhdHttpError && error.status === 404 && options.mode === "fundamentals") await markEtfFetched(db, fund.listing_key, "fundamentals", "failed");
          if (options.mode === "backfill" && !stopping(error)) await markEtfFetched(db, fund.listing_key, "backfill", "failed");
          if (stopping(error)) { counts.deferred = due.length - index - 1; break; }
        }
      }
    }
  } finally {
    counts.calls = spentCalls(api);
    if (counts.calls) await logEodhdCalls(db, etfJobName(options.mode), counts.calls);
  }
  counts.estimatedCalls = counts.calls;
  counts.failures = failed.length;
  counts.failedSymbols = failed.slice(0, 20).join(",");
  return counts;
}

if (process.argv[1]?.endsWith("eodhd-etf.ts") || process.argv[1]?.endsWith("eodhd-etf.js")) {
  const options = parseEtfJobArgs(process.argv.slice(2));
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runLoggedJob(etfJobName(options.mode), async () => {
    try { const result = await runEtfJob(db, options.dryRun ? null : new EodhdClient(), options); if (result.failures) process.exitCode = 1; return result; }
    finally { await db.end(); }
  }, options.dryRun ? { store: null } : {});
}
